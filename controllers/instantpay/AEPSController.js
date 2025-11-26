require("dotenv").config();
const axios = require("axios");
const createError = require("http-errors");
const Joi = require("joi");
const xml2js = require("xml2js");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../../utils/chargeCaluate");
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const payOutModel = require("../../models/payOutModel");
const { distributeCommission } = require("../../utils/distributerCommission");
const CommissionTransaction = require("../../models/CommissionTransaction");
const payInModel = require("../../models/payInModel");
const AEPSTransaction = require("../../models/aepsModels/withdrawalEntry");

const instantpay = axios.create({
  baseURL: "https://api.instantpay.in",
  // timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    "X-Ipay-Client-Id": "YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
    "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
    "X-Ipay-Auth-Code": "1",
    "X-Ipay-Endpoint-Ip": "2401:4900:1c1a:3375:79e6:7c23:63b2:2221",
  },
});

// Helpers
function normalizePayloadForEnquiry(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}

function normalizePayloadForPayment(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    paymentMode: body.paymentMode || "Cash",
    paymentInfo: body.paymentInfo || { Remarks: "CashPayment" },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}

const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY
// Helper function (normal bana do)
async function parsePidXML(pidXml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(pidXml, { explicitArray: true }, (err, result) => {
      if (err) return reject(err);

      try {
        const resp = result.PidData.Resp[0];
        const deviceInfo = result.PidData.DeviceInfo[0];
        const skey = result.PidData.Skey[0];
        const hmac = result.PidData.Hmac[0];
        const data = result.PidData.Data[0];

        // extract additional_info Params
        let params = {};
        if (deviceInfo.additional_info && deviceInfo.additional_info[0].Param) {
          deviceInfo.additional_info[0].Param.forEach((p) => {
            params[p.$.name] = p.$.value;
          });
        }

        resolve({
          dc: deviceInfo.$.dc,
          dpId: deviceInfo.$.dpId,
          rdsId: deviceInfo.$.rdsId,
          rdsVer: deviceInfo.$.rdsVer,
          mi: deviceInfo.$.mi,
          mc: deviceInfo.$.mc,
          ci: skey.$.ci,
          sessionKey: skey._,
          hmac: hmac,
          pidDataType: data.$.type,
          pidData: data._,
          errCode: resp.$.errCode,
          errInfo: resp.$.errInfo,
          fCount: resp.$.fCount || "0",
          fType: resp.$.fType || "0",
          iCount: resp.$.iCount || "0",
          pCount: resp.$.pCount || "0",
          qScore: resp.$.qScore || "",
          nmPoints: resp.$.nmPoints || "",
          srno: params.srno || "",
          sysid: params.sysid || "",
          ts: params.ts || "",
          modality_type: params.modality_type || "",
          device_type: params.device_type || "",
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}





function encrypt(text, key) {
  const encryptionKey = Buffer.from(key); // 32 bytes
  const algorithm = "aes-256-cbc";
  const iv = crypto.randomBytes(16); // 16 bytes IV
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  // IV ko bhi attach kar dete hain (Base64 me safe transfer ke liye)
  const encryptedData = Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
  return encryptedData;
}

exports.outletRegister = async (req, res, next) => {
  try {
    const schema = Joi.object({
      mobile: Joi.string().length(10).required(),
      email: Joi.string().email().required(),
      aadhaar: Joi.string().length(12).required(),
      pan: Joi.string().length(10).required(),
      shopName: Joi.string().required(),
      address: Joi.string().required(),
      pincode: Joi.string().length(6).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) throw createError(400, error.details[0].message);

    const response = await instantpay.post("/fi/outlet/register", value);
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Register Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLoginStatus = async (req, res, next) => {
  try {
    const { outletId } = req.body;
    if (!outletId) throw createError(400, "OutletId required");

    const response = await instantpay.post("/fi/aeps/outletLoginStatus", { outletId }, {
      headers: {
        "X-Ipay-Outlet-Id": outletId,
      },
    });
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Login Status Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLogin = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id)
    const { outletId, aadhaar, pidData, latitude, longitude } = req.body;
    console.log("📥 Incoming Outlet Login Request:", req.body);

    if (!outletId || !aadhaar || !pidData) throw createError(400, "Missing parameters");

    // Aadhaar encrypt
    // const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");

    // Parse PID XML to biometricData object
    const biometricParsed = await parsePidXML(pidData);

    const payload = {
      type: "DAILY_LOGIN",
      latitude: user.aepsInstantPayLat || latitude,
      longitude: user.aepsInstantPayLng || longitude,
      externalRef: `REF${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`,
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar: encrypt(aadhaar, encryptionKey),
        ...biometricParsed,

      },
    };

    console.log("📤 Final Outlet Login Payload:", JSON.stringify(payload, null, 2));

    const response = await instantpay.post("/fi/aeps/outletLogin", payload, {
      headers: {
        "X-Ipay-Outlet-Id": outletId,
      },
    });
    console.log("✅ Outlet Login Response:", response.data);

    return res.json(response.data);
  } catch (err) {
    console.error("❌ Outlet Login Error:", err.response?.data || err.message);
    next(err);
  }
};



exports.cashWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      aadhaar,
      bankiin,
      latitude,
      longitude,
      mobile,
      amount,
      pidData,
      category
    } = req.body;

    if (!aadhaar || !bankiin || !mobile || !amount || !pidData || !category) {
      return res.status(400).json({ status: false, message: "Missing required fields" });
    }

    const userId = req.user.id;
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    // Get commission details
    const { commissions, service } = await getApplicableServiceCharge(userId, "6918314027e9c0be214ff15d");
    const commission = commissions
      ? calculateCommissionFromSlabs(amount, commissions)
      : { charge: 0, gst: 0, tds: 0, distributor: 0, admin: 0, retailer: 0 };

    const externalRef = `ACW${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const biometricParsed = await parsePidXML(pidData);
    const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");

    const required = Number(amount) + Number(commission.charge || 0) + Number(commission.tds || 0) + Number(commission.gst || 0) - Number(commission.retailer || 0);

    // Create AEPS Report (Pending)
    const aepsReport = await AEPSTransaction.create([{
      userId,
      type: "Withdrawal",
      balance_after: user.eWallet,
      adhaarnumber: aadhaar,
      mobilenumber: mobile,
      bankiin,
      submerchantid: "",
      amount,
      totalCredit: required,
      totalDebit: Number(commission.charge || 0) + Number(commission.tds || 0) + Number(commission.gst || 0),
      clientrefno: externalRef,
      charges: commission.charge || 0,
      gst: commission.gst || 0,
      tds: commission.tds || 0,
      retailerCommission: Number(commission.retailer || 0),
      distributorCommission: Number(commission.distributor || 0),
      adminCommission: Number(commission.admin || 0),
      status: "Pending"
    }], { session });

    // Create debit transaction
    const [debitTxn] = await Transaction.create([{
      user_id: userId,
      transaction_type: "credit",
      type: service._id,
      amount,
      gst: commission.gst,
      tds: commission.tds,
      charge: commission.charge,
      totalCredit: required,
      totalDebit: Number(commission.charge || 0) + Number(commission.tds || 0) + Number(commission.gst || 0),
      balance_after: user.eWallet,
      payment_mode: "bank_transfer",
      transaction_reference_id: externalRef,
      description: "AEPS Cash Withdrawal",
      status: "Pending"
    }], { session });

    // Create payout record
    await new payInModel({
      userId,
      amount: required,
      reference: externalRef,
      trans_mode: "AEPS",
      type: service._id,
      name: user.name,
      mobile: user.mobileNumber,
      email: user.email,
      status: "Pending",
      source: "PayIn",
      charges: commission.charge || 0,
      gst: commission.gst,
      tds: commission.tds,
      remark: `AEPS Cash Withdrawal for mobile ${mobile}`
    }).save({ session });

    // Call InstantPay API
    const response = await instantpay.post("/fi/aeps/cashWithdrawal", {
      bankiin,
      latitude: user.aepsInstantPayLat || latitude,
      longitude: user.aepsInstantPayLng || longitude,
      mobile,
      amount: String(amount),
      externalRef,
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    }, {
      headers: {
        "X-Ipay-Outlet-Id": user.outletId,
      },
    });

    const result = response.data;

    // ✅ API Success
    if (result.statuscode === "TXN") {
      // ✅ Update user's wallet
      user.eWallet = (user.eWallet || 0) + required;
      await user.save({ session });

      // ✅ Update Transaction
      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        {
          $set: {
            status: "Success",
            balance_after: user.eWallet,
          },
        },
        { session }
      );

      // ✅ Update PayIn record
      await payInModel.updateOne(
        { reference: externalRef },
        {
          $set: {
            status: "Success",
          },
        },
        { session }
      );

      // ✅ Update AEPS Transaction
      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        {
          $set: {
            status: "Success",
            balance_after: user.eWallet,
            apiResponse: result,
          },
        },
        { session }
      );

      // Distribute commissions
      await distributeCommission({
        user: userId,
        distributer: user.distributorId,
        service,
        transferAmount: amount,
        commission,
        reference: externalRef,
        description: "Commission for AEPS Cash Withdrawal",
        session
      });

      // Create commission transaction
      await CommissionTransaction.create([{
        referenceId: externalRef,
        service: service._id,
        baseAmount: amount,
        charge: commission.charge + commission.gst + commission.tds,
        netAmount: required,
        roles: [
          { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: commission.charge || 0 },
          { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
          { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
        ],
        type: "credit",
        status: "Success",
        sourceRetailerId: userId
      }], { session });

      await session.commitTransaction();
      res.status(200).json({ status: true, message: "Cash Withdrawal successful", data: result });

    } else {
      // ❌ API Failed
      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        { status: "Failed", apiResponse: result },
        { session }
      );

      await Transaction.updateOne({ transaction_reference_id: externalRef }, { $set: { status: "Failed" } }, { session });
      await payInModel.updateOne({ reference: externalRef }, { $set: { status: "Failed" } }, { session });

      throw new Error(result.status || "Cash Withdrawal failed at provider");
    }

  } catch (err) {
    await session.abortTransaction();
    console.error("💥 Cash Withdrawal Error:", err.response?.data || err.message);
    res.status(500).json({
      status: false,
      message: err.message || "Cash Withdrawal failed",
      error: err.response?.data || err.message
    });
  } finally {
    session.endSession();
  }
};

exports.balanceEnquiry = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await userModel.findById(req.user.id).session(session);
    if (!user) throw new Error("User not found");
    const { aadhaar, bankiin, mobile, pidData, category, latitude, longitude } = req.body;
    if (!aadhaar || !bankiin || !mobile || !pidData || !category || !longitude || !latitude)
      throw createError(400, "Missing required fields");

    const biometricParsed = await parsePidXML(pidData);
    const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");
    const externalRef = `AEPS${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      type: "DAILY_LOGIN",
      bankiin,
      latitude: user.aepsInstantPayLat || latitude,
      longitude: user.aepsInstantPayLng || longitude,
      mobile,
      externalRef,
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };



    const { commissions } = await getApplicableServiceCharge(req.user.id, category);
    // const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const required = Number(commissions.aepsBalanceEnquiry);

    // if (usableBalance < required) {
    //   return res.status(400).json({
    //     status: false,
    //     message: `Insufficient wallet balance. Available: ₹${user.eWallet}, Required: ₹${required}`,
    //   });
    // }


    user.eWallet += required;
    await user.save({ session });

    // 🔹 Create AEPS transaction entry
    const txn = await AEPSTransaction.create([{
      userId: req.user.id,
      balance_after: user.eWallet,
      type: "BalanceEnquiry",
      adhaarnumber: aadhaar,
      mobilenumber: mobile,
      bankiin,
      submerchantid: "",
      amount: 0,
      clientrefno: externalRef,
      retailerCommission: required,
      gst: 0,
      tds: 0,
      status: "Pending"
    }], { session });

    const [debitTxn] = await Transaction.create([{
      user_id: req.user.id,
      transaction_type: "credit",
      type: commissions.service,
      amount: 0,
      totalCredit: required,
      balance_after: user.eWallet,
      payment_mode: "bank_transfer",
      transaction_reference_id: externalRef,
      description: "AEPS BalanceEnquiry",
      status: "Pending"
    }], { session });

    // 🔹 Create payout log
    await payInModel.create([{
      userId: req.user.id,
      amount: required,
      reference: externalRef,
      type: commissions.service,
      name: user.name,
      mobile: user.mobileNumber,
      email: user.email,
      status: "Pending",
      charges: 0,
      gst: 0,
      tds: 0,
      source: "Commission",
      remark: `Balance Enquiry (AePS)`
    }], { session });

    // 🔹 Call API
    const response = await instantpay.post("/fi/aeps/balanceInquiry", payload, {
      headers: {
        "X-Ipay-Outlet-Id": user.outletId,
      },
    });
    const apiRes = response.data;

    if (apiRes.statuscode === "TXN") {
      // ✅ Success case
      await AEPSTransaction.updateOne(
        { clientrefno: externalRef },
        {
          $set: {
            status: "Success",
            apiResponse: apiRes,
            balance_after: user.eWallet,
          },
        },
        { session }
      );

      await payInModel.updateOne(
        { reference: externalRef },
        {
          $set: {
            status: "Success",
          },
        },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        {
          $set: {
            status: "Success",
            balance_after: user.eWallet,
          },
        },
        { session }
      );
    } else {
      if (required > 0) {
        user.eWallet -= required;
        await user.save({ session });
      }

      await AEPSTransaction.updateOne(
        { clientrefno: externalRef },
        {
          $set: {
            status: "Failed",
            apiResponse: apiRes,
            balance_after: user.eWallet,
          },
        },
        { session }
      );

      await payInModel.updateOne(
        { reference: externalRef },
        {
          $set: {
            status: "Failed",
          },
        },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        {
          $set: {
            status: "Failed",
            balance_after: user.eWallet,
          },
        },
        { session }
      );
    }


    await session.commitTransaction();
    return res.json(apiRes);
  } catch (err) {
    await session.abortTransaction();
    console.error("Balance Enquiry Error:", err.response?.data || err.message);
    next(err);
  } finally {
    session.endSession();
  }
};

exports.miniStatement = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { aadhaar, bankiin, mobile, pidData, category, latitude,
      longitude } = req.body;
    const userId = req.user.id;
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    if (!aadhaar || !bankiin || !mobile || !pidData || !category) throw createError(400, "Missing required fields");
    const biometricParsed = await parsePidXML(pidData);
    const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");
    const externalRef = `AEPS${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const payload = {
      type: "DAILY_LOGIN",
      bankiin,
      latitude: user.aepsInstantPayLat || latitude,
      longitude: user.aepsInstantPayLng || longitude,
      mobile,

      externalRef: externalRef,
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };

    const { commissions } = await getApplicableServiceCharge(userId, category);

    // const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const required = Number(commissions.aepsMiniStatement);
    if (required === 0) {
      const { data } = await instantpay.post("/fi/aeps/balanceInquiry", payload, {
        headers: {
          "X-Ipay-Outlet-Id": user.outletId,
        },
      });
      await session.commitTransaction();
      return res.json(data);
    }
    // if (usableBalance < required) {
    //   return res.status(400).json({
    //     status: false,
    //     message: `Insufficient wallet balance. Available: ₹${user.eWallet}, Required: ₹${required + (user.cappingMoney || 0)}`
    //   });
    // }

    // Deduct wallet
    user.eWallet += required;
    await user.save({ session });

    const aepsReport = await AEPSTransaction.create([{
      userId: req.user.id,
      balance_after: user.eWallet,
      type: "MiniStatement",
      adhaarnumber: aadhaar,
      mobilenumber: mobile,
      bankiin,
      submerchantid: "",
      amount: 0,
      clientrefno: externalRef,
      retailerCommission: required,
      gst: 0,
      tds: 0,
      status: "Pending"
    }], { session });

    const [debitTxn] = await Transaction.create([{
      user_id: req.user.id,
      transaction_type: "credit",
      type: commissions.service,
      amount: 0,
      totalCredit: required,
      balance_after: user.eWallet,
      payment_mode: "bank_transfer",
      transaction_reference_id: externalRef,
      description: "AEPS MiniStatement",
      status: "Pending"
    }], { session });

    await payInModel.create([{
      userId: req.user.id,
      amount: required,
      reference: externalRef,
      type: commissions.service,
      name: user.name,
      mobile: user.mobileNumber,
      email: user.email,
      status: "Pending",
      charges: 0,
      gst: 0,
      tds: 0,
      source: "Commission",
      remark: `Mini Statement (AePS)`
    }], { session });

    const response = await instantpay.post("/fi/aeps/miniStatement", payload, {
      headers: {
        "X-Ipay-Outlet-Id": user.outletId
      },
    });

    if (response.data.statuscode === "TXN") {

      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        {
          $set: {
            status: "Success",
            apiResponse: response.data,
            balance_after: user.eWallet,
          },
        },
        { session }
      );

      await payInModel.updateOne(
        { reference: externalRef },
        {
          $set: {
            status: "Success",
          },
        },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        {
          $set: {
            status: "Success",
            balance_after: user.eWallet,
          },
        },
        { session }
      );

    } else {
      // ❌ FAILED CASE → Refund user if required
      if (required > 0) {
        user.eWallet -= required;
        await user.save({ session });
      }

      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        {
          $set: {
            status: "Failed",
            apiResponse: response.data,
            balance_after: user.eWallet,
          },
        },
        { session }
      );

      await payInModel.updateOne(
        { reference: externalRef },
        {
          $set: {
            status: "Failed",
          },
        },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        {
          $set: {
            status: "Failed",
            balance_after: user.eWallet,
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    return res.json(response.data);
  } catch (err) {
    await session.abortTransaction();
    console.error("Mini Statement Error:", err.response?.data || err.message);
    next(err);
  }
  finally {
    session.endSession();
  }
};
exports.deposite = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { aadhaar, bankiin, mobile, amount, pidData, category, latitude,
      longitude } = req.body;
    const userId = req.user.id;
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    if (!aadhaar || !bankiin || !mobile || !pidData || !category) throw createError(400, "Missing required fields");
    const biometricParsed = await parsePidXML(pidData);
    const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");
    const payload = {
      // type: "DAILY_LOGIN",
      bankiin,
      latitude: user.aepsInstantPayLat || latitude,
      longitude: user.aepsInstantPayLng || longitude,
      mobile,
      amount,
      externalRef: `AEPS${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`,
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };





    // Get commission details
    const { commissions, service } = await getApplicableServiceCharge(userId, category);
    const commission = commissions
      ? calculateCommissionFromSlabs(amount, commissions)
      : { charge: 0, gst: 0, tds: 0, distributor: 0, admin: 0, retailer: 0 };

    const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const required = Number(amount) + Number(commission.charge || 0) + Number(commission.tds || 0) + Number(commission.gst || 0) - Number(commission.retailer);

    // ✅ Balance check
    if (usableBalance < required) {
      await session.abortTransaction();
      return res.status(400).json({
        error: true,
        message: `Insufficient wallet balance. Maintain ₹${user.cappingMoney}. Available: ₹${user.eWallet}, Required: ₹${required}`,
      });
    }

    const externalRef = `ACD-${new mongoose.Types.ObjectId()}`;
    // Create AEPS Report (Pending)
    const aepsReport = await AEPSTransaction.create([{
      userId,
      type: "Deposit",
      adhaarnumber: aadhaar,
      mobilenumber: mobile,
      balance_after: user.eWallet,
      bankiin,
      submerchantid: "",
      amount,
      totalCredit: Number(commission.retailer || 0),
      totalDebit: required,
      clientrefno: externalRef,
      charges: commission.charge || 0,
      gst: commission.gst || 0,
      tds: commission.tds || 0,
      retailerCommission: Number(commission.retailer || 0),
      distributorCommission: Number(commission.distributor || 0),
      adminCommission: Number(commission.admin || 0),
      status: "Pending"
    }], { session });

    // Create debit transaction
    const [debitTxn] = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      type: service._id,
      amount,
      gst: commission.gst,
      tds: commission.tds,
      charge: commission.charge,
      totalDebit: required,
      totalCredit: Number(commission.retailer || 0),
      balance_after: user.eWallet,
      payment_mode: "bank_transfer",
      transaction_reference_id: externalRef,
      description: "AEPS Cash Deposit",
      status: "Pending"
    }], { session });

    // Create payout record
    await new payOutModel({
      userId,
      amount,
      reference: externalRef,
      trans_mode: "AEPS",
      type: service._id,
      name: user.name,
      mobile: user.mobileNumber,
      email: user.email,
      status: "Pending",
      source: "AEPS Deposite",
      charges: commission.charge || 0,
      gst: commission.gst,
      tds: commission.tds,
      totalDebit: required,
      remark: `AEPS Cash Deposit for mobile ${mobile}`
    }).save({ session });


    const response = await instantpay.post("/fi/aeps/cashDeposit", payload, {
      headers: {
        "X-Ipay-Outlet-Id": user.outletId,
      },
    });
    const result = response.data;
    if (result.statuscode === "TXN") {
      user.eWallet = (user.eWallet || 0) - Number(required);
      await user.save({ session });

      await Transaction.updateOne({ transaction_reference_id: externalRef }, { $set: { status: "Success", balance_after: user.eWallet, } }, { session });
      await payOutModel.updateOne({ reference: externalRef }, { $set: { status: "Success" } }, { session });
      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        { status: "Success", apiResponse: result, balance_after: user.eWallet, },
        { session }
      );

      // Distribute commissions
      await distributeCommission({
        user: userId,
        distributer: user.distributorId,
        service,
        transferAmount: amount,
        commission,
        reference: externalRef,
        description: "Commission for AEPS Cash Deposit",
        session
      });

      // Create commission transaction
      await CommissionTransaction.create([{
        referenceId: externalRef,
        service: service._id,
        baseAmount: amount,
        charge: commission.charge + commission.gst,
        netAmount: required,
        roles: [
          { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: commission.charge || 0 },
          { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
          { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
        ],
        type: "credit",
        status: "Success",
        sourceRetailerId: userId
      }], { session });

      await session.commitTransaction();
      res.status(200).json({ status: true, message: "Cash Deposit successful", data: result });

    } else {
      // ❌ API Failed
      await AEPSTransaction.findOneAndUpdate(
        { clientrefno: externalRef },
        { status: "Failed", apiResponse: result, balance_after: user.eWallet, },
        { session }
      );

      await Transaction.updateOne({ transaction_reference_id: externalRef }, { $set: { status: "Failed", balance_after: user.eWallet, } }, { session });
      await payOutModel.updateOne({ reference: externalRef }, { $set: { status: "Failed" } }, { session });

      throw new Error(result.status || "Cash Deposit failed at provider");
    }

    return res.json(response.data);
  } catch (err) {
    await session.abortTransaction();

    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({
      status: false,
      message: err.message || "Cash Deposit failed",
      error: err.response?.data || err.message
    });
  } finally {
    session.endSession();
  }
};
exports.getBankList = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await userModel.findById(userId);
    if (!user) throw new Error("User not found");
    const response = await instantpay.get("/fi/aeps/banks", {
      headers: {
        "X-Ipay-Outlet-Id": user.outletId || "561907",
      },
    });
    return res.json(response.data);
  } catch (err) {
    console.error("Bank List Error:", err.response?.data || err.message);
    next(err);
  }
};
