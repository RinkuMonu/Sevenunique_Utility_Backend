const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const OnboardTransaction = require("../../models/aepsModels/onboardingMerchants.js");
const userModel = require("../../models/userModel.js");
const { default: mongoose } = require("mongoose");
const AEPSWithdrawal = require("../../models/aepsModels/withdrawalEntry.js");
const getDmtOrAepsMeta = require("../../utils/aeps&DmtCommmsion.js");
const {
  calculateCommissionFromSlabs,
  getApplicableServiceCharge,
  logApiCall,
} = require("../../utils/chargeCaluate.js");
const Transaction = require("../../models/transactionModel.js");
const payOutModel = require("../../models/payOutModel.js");
const logger = require("../../utils/logger.js");
const {
  distributeCommission,
} = require("../../utils/distributerCommission.js");
const { promises } = require("dns");

const headers = {
  Token: generatePaysprintJWT(),
  Authorisedkey: "MGY1MTVmNWM3Yjk5MTdlYTcyYjk5NmUzZjYwZDVjNWE=",
};

const BASE_URL =
  "https://sit.paysprint.in/service-api/api/v1/service/onboard/onboardnew/getonboardurl";
const JWT_SECRET = "UFMwMDE3OTIzYzdhYmFiZWU5OWJkMzAzNTEyNDQ0MmNmMGFiMWUyOA==";

const AES_KEY = "557aefe5593170ad"; // Must be 16 characters
const AES_IV = "7c4851aad3e91b9c"; // Must be 16 characters

const WADH = "18f4CEiXeXcfGXvgWA/blxD+w2pw7hfQPY45JMytkPw=";

const decryptJWT = (token, secretKey) => {
  try {
    const decoded = jwt.verify(token, secretKey);
    return decoded;
  } catch (error) {
    throw new Error("JWT Decryption Failed: " + error.message);
  }
};

function encryptPidData(piddata) {
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(AES_KEY, "utf8"),
    Buffer.from(AES_IV, "utf8")
  );
  let encrypted = cipher.update(piddata, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function encrypt(data) {
  const jsonData = JSON.stringify(data); // Convert object to JSON string
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(AES_KEY, "utf8"),
    Buffer.from(AES_IV, "utf8")
  );

  let encrypted = cipher.update(jsonData, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted; // This is the encrypted Base64 string
}

exports.generateOnboardURL = async (req, res) => {
  const { id, merchantcode, mobile, email, firm, callback } = req.body;
  const payload = {
    merchantcode,
    mobile,
    is_new: "0",
    email,
    firm,
    callback,
  };
  try {
    const merchantData = await OnboardTransaction.findOne({ user_id: id });
    if (merchantData) {
      return res
        .status(400)
        .json({ message: "Merchant already in onboarded row." });
    }

    let onboardingUser = userModel.findOne({
      _id: id,
      status: true,
      mobileNumber: mobile,
    });

    if (!onboardingUser) {
      return res.status(404).json({ message: "User not found or inactive." });
    }
    const response = await axios.post(BASE_URL, payload, {
      headers,
    });
    logApiCall({
      url: BASE_URL,
      requestData: req.body,
      responseData: response.data,
    });
    if (response.data.status) {
      await OnboardTransaction.create({
        user_id: new mongoose.Types.ObjectId(id),
        merchantcode,
        mobile,
        email,
        firm,
        callback,
      });

      return res.json({
        redirectUrl: response.data.redirecturl,
        message: "Onboarding initiated successfully.",
      });
    } else {
      return res
        .status(400)
        .json({
          message: "Failed to initiate onboarding.",
          error: response.data.message,
        });
    }
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

exports.transactionCallback = async (req, res) => {
  console.log("transaction callback", req.body);
  const { param, param_inc } = req.body;
  let decryptedParam;
  try {
    decryptedParam = decryptJWT(param_inc, JWT_SECRET);
  } catch (e) {
    return res
      .status(400)
      .json({ status: 400, message: "Invalid encrypted data." });
  }
  const { merchant_id, partner_id, request_id, amount } = decryptedParam;

  console.log(`Deducting ₹${amount} from Merchant: ${merchant_id}`);

  return res.json({
    status: 200,
    message: "Transaction completed successfully",
  });
};

exports.updateOnboardTransaction = async (req, res, next) => {
  try {
    const {
      id,
      refno,
      merchantcode,
      status,
      txnid,
      partnerid,
      callback,
      email,
      firm,
      bank,
    } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ error: true, message: "Transaction ID is required" });
    }

    const updateFields = {};

    if (status) updateFields.status = status;
    if (txnid) updateFields.txnid = txnid;
    if (partnerid) updateFields.partnerid = partnerid;
    if (callback) updateFields.callback = callback;
    if (email) updateFields.email = email;
    if (firm) updateFields.firm = firm;
    if (bank) updateFields.bank = bank;
    updateFields.callbackReceivedAt = new Date();

    const updatedTransaction = await OnboardTransaction.findOneAndUpdate(
      { merchantcode, _id: id },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedTransaction) {
      return res
        .status(404)
        .json({ error: true, message: "Transaction not found" });
    }

    res.status(200).json({
      success: true,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    return next(error);
  }
};

exports.onboardResponseCallback = async (req, res) => {
  const { data } = req.query;
  let decryptedData;
  try {
    decryptedData = decryptJWT(data, JWT_SECRET);
  } catch (e) {
    return res.status(400).json({ message: "Decryption failed." });
  }
  const { refno, txnid, status, mobile, partnerid, merchantcode, bank } =
    decryptedData;
  if (status === "1" || status === "0") {
    await OnboardTransaction.findOneAndUpdate(
      { merchantcode },
      {
        refno,
        txnid,
        status: status === "1" ? "Success" : "Pending",
        mobile,
        partnerid,
        bank,
        callbackReceivedAt: new Date(),
      },
      { new: true, upsert: true }
    );
  }
  return res.json({ data: decryptedData, message: "Callback received" });
};

exports.activateMerchant = async (req, res, next) => {
  const {
    merchantcode,
    aadhaar,
    piddata = `<PidData>....</PidData>`,
    dob,
    is_casa = "0",
  } = req.body;

  if (!merchantcode || !aadhaar || !piddata || !dob) {
    return res.status(400).json({
      status: false,
      message: "Missing required parameters.",
    });
  }
  try {
    const encryptedPID = encryptPidData(piddata);
    const payload = {
      merchantcode,
      aadhaar,
      piddata: encryptedPID,
      dob,
      is_casa,
    };
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/onboard/onboard/activate_merchant",
      payload,
      {
        headers,
      }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/onboard/onboard/activate_merchant",
      requestData: req.body,
      responseData: response.data,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error activating merchant:", error);
    return next(error);
  }
};

exports.checkOnboardStatus = async (req, res, next) => {
  const { merchantcode, mobile, pipe } = req.body;

  if (!merchantcode || !mobile || !pipe) {
    return res.status(400).json({
      status: false,
      response_code: 8,
      message: "Missing required parameters: merchantcode, mobile, pipe",
    });
  }
  try {
    const payload = {
      merchantcode,
      mobile,
      pipe,
    };
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/onboard/onboard/getonboardstatus",
      payload,
      {
        headers,
      }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/onboard/onboard/getonboardstatus",
      requestData: req.body,
      responseData: response.data,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error checking onboarding status:", error.message);
    return next(error);
  }
};

exports.registerMerchant = async (req, res, next) => {
  const ipaddre =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress;
  try {
    const {
      accessmodetype = "SITE",
      adhaarnumber,
      mobilenumber,
      latitude,
      longitude,
      referenceno,
      submerchantid,
      is_iris,
      timestamp = new Date(),
      data = `<PidData>....</PidData>`,
      ipaddress = ipaddre,
    } = req.body;

    if (!referenceno || !submerchantid || !timestamp) {
      return res.status(400).json({
        status: false,
        response_code: 8,
        message: "Missing required parameters.",
      });
    }

    const payload = {
      accessmodetype: accessmodetype || "SITE",
      adhaarnumber,
      mobilenumber,
      latitude,
      longitude,
      referenceno,
      submerchantid,
      is_iris: is_iris || "No",
      timestamp,
      data,
      ipaddress,
    };

    const encryptedBody = encrypt(payload);
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/registration",
      { body: encryptedBody },
      { headers }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/registration",
      requestData: req.body,
      responseData: response.data,
    });

    if (response.data.response_code == 1) {
      await OnboardTransaction.findOneAndUpdate(
        { merchantcode: submerchantid },
        { activationStatus: "Activated" },
        { new: true, upsert: true }
      );
    }
    return res.status(response.status).json(response.data);
  } catch (error) {
    return next(error);
  }
};

exports.authenticateMerchant = async (req, res) => {
  const ipaddre =
    req.headers["x-forwarded-for"]?.split(",")[0] || // If behind proxy
    req.socket?.remoteAddress || // Direct connection
    req.connection?.remoteAddress;
  try {
    const {
      accessmodetype,
      adhaarnumber,
      mobilenumber,
      latitude,
      longitude,
      referenceno,
      submerchantid,
      is_iris,
      timestamp = Date.now(),
      data = `<PidData>....</PidData>`,
      ipaddress = ipaddre,
    } = req.body;

    if (!referenceno || !submerchantid || !timestamp) {
      return res.status(400).json({
        status: false,
        response_code: 8,
        message: "Missing required parameters.",
      });
    }

    const payload = {
      accessmodetype: accessmodetype || "APP",
      adhaarnumber,
      mobilenumber,
      latitude,
      longitude,
      referenceno,
      submerchantid,
      is_iris: is_iris || "No",
      timestamp,
      data,
      ipaddress,
    };

    const encryptedBody = encrypt(payload);

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/authentication",
      { body: encryptedBody },
      { headers }
    );

    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/authentication",
      requestData: req.body,
      responseData: response.data,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error during authentication:", error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

exports.balanceEnquiry = async (req, res, next) => {
  try {
    const {
      latitude,
      longitude,
      mobilenumber,
      adhaarnumber,
      nationalbankidentification,
      ipaddress = "192.168.1.91",
      referenceno,
      accessmodetype = "SITE",
      requestremarks = "",
      data = `<PidData>....</PidData>`,
      pipe = "bank1",
      timestamp = new Date().toISOString().slice(0, 19).replace("T", " "),
      transactiontype = "BE",
      submerchantid = "1",
      is_iris = "No",
    } = req.body;

    if (!latitude || !longitude || !mobilenumber) {
      return res
        .status(400)
        .json({ error: true, message: "Missing mandatory fields" });
    }

    const plainBody = {
      latitude,
      longitude,
      mobilenumber,
      referenceno,
      ipaddress,
      adhaarnumber,
      accessmodetype,
      nationalbankidentification,
      requestremarks,
      data,
      pipe,
      timestamp,
      transactiontype,
      submerchantid,
      is_iris,
    };

    const encryptedBody = encrypt(plainBody);

    const { data: psResp } = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/balanceenquiry/index",
      { body: encryptedBody },
      { headers }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/balanceenquiry/index",
      requestData: req.body,
      responseData: psResp,
    });
    return res.json(psResp);
  } catch (err) {
    return next(err);
  }
};

exports.withdrawWithAuth = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  const ipaddre =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress;

  try {
    const {
      latitude = 1.25454454,
      longitude = 1.75454454,
      mobilenumber,
      adhaarnumber,
      nationalbankidentification,
      ipaddress = ipaddre,
      referenceno,
      accessmodetype = "WEB",
      requestremarks = "",
      data,
      pipe = "bank1",
      timestamp = new Date().toISOString().slice(0, 19).replace("T", " "),
      transactiontype = "CW",
      submerchantid = "1",
      amount,
      is_iris = "No",
    } = req.body;

    await getApplicableServiceCharge(req.user.id, "AEPS");

    if (
      !mobilenumber ||
      !adhaarnumber ||
      !data ||
      !amount ||
      !nationalbankidentification
    ) {
      return res
        .status(400)
        .json({ error: true, message: "Missing required fields" });
    }

    const user = await userModel.findById(req.user.id).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: true, message: "User not found" });
    }

    const { commissionPackage } = await getDmtOrAepsMeta(req.user.id, "AEPS");
    if (!commissionPackage?.isActive) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({
          success: false,
          message: "AEPS package not active for this user",
        });
    }

    const commission = calculateCommissionFromSlabs(
      amount,
      commissionPackage?.slabs || []
    );
    const totalDebit = commission.totalCommission;

    if (user.eWallet < totalDebit) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ error: true, message: "Insufficient wallet balance" });
    }

    user.eWallet -= totalDebit;
    await user.save({ session });

    const plainBody = {
      latitude: latitude || 1.25454454,
      longitude: longitude || 1.75454454,
      mobilenumber,
      referenceno,
      ipaddress,
      adhaarnumber,
      accessmodetype,
      nationalbankidentification,
      requestremarks,
      data,
      pipe,
      timestamp,
      transactiontype,
      submerchantid,
      amount,
      is_iris,
    };

    const encryptedBody = encrypt(plainBody);

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/authcashwithdraw/index",
      { body: encryptedBody },
      { headers, timeout: 180000 }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/authcashwithdraw/index",
      requestData: req.body,
      responseData: response.data,
    });
    const resData = response?.data;
    if (resData?.status) {
      if (resData?.status) {
        await Promise.all([
          AEPSWithdrawal.create(
            [
              {
                status: resData.status,
                ackno: resData.ackno,
                amount: resData.amount,
                balanceamount: resData.balanceamount,
                bankrrn: resData.bankrrn?.toString(),
                bankiin: resData.bankiin,
                mobilenumber,
                clientrefno: resData.clientrefno || referenceno,
                adhaarnumber,
                submerchantid,
                userId: req.user.id,
                charges: totalDebit,
              },
            ],
            { session }
          ),

          Transaction.create(
            [
              {
                user_id: req.user.id,
                transaction_type: "debit",
                amount: Number(totalDebit),
                balance_after: user.eWallet,
                payment_mode: "wallet",
                transaction_reference_id: referenceno,
                description: "AEPS Withdrawal Charges",
                status: "Success",
              },
            ],
            { session }
          ),

          payOutModel.create(
            [
              {
                userId: req.user.id,
                amount: 0,
                reference: referenceno,
                trans_mode: "WALLET",
                name: user.name,
                mobile: user.mobileNumber,
                email: user.email,
                status: "Success",
                charges: commission.totalCommission,
                remark: `AEPS Cash Withdrawal`,
              },
            ],
            { session }
          ),

          distributeCommission({
            distributer: user.distributorId,
            service: "AEPS",
            amount,
            commission,
            reference: referenceno,
            description: "Commission for AEPS Cash Withdrawal",
          }),
        ]);
      }
    } else {
      user.eWallet += totalDebit;
      await user.save({ session });
      await Transaction.create(
        [
          {
            user_id: req.user.id,
            transaction_type: "debit",
            amount: totalDebit,
            balance_after: user.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: referenceno,
            description: "Refund: AEPS Withdrawal Failed Charges",
            status: "Failed",
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: resData?.message || "AEPS request failed. Wallet refunded.",
        refunded: true,
        wallet: user.eWallet,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json(resData);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in AEPS Withdrawal:", err);
    return next(err);
  }
};

exports.getMiniStatement = async (req, res, next) => {
  try {
    const {
      latitude,
      longitude,
      mobilenumber,
      adhaarnumber,
      nationalbankidentification,
      data,
      pipe = "bank2",
      ipaddress = req.ip,
      accessmodetype = "SITE",
      referenceno,
      requestremarks = "",
      timestamp = new Date().toISOString().slice(0, 19).replace("T", " "),
      submerchantid,
      is_iris = "No",
    } = req.body;

    if (
      !latitude ||
      !longitude ||
      !mobilenumber ||
      !adhaarnumber ||
      !data ||
      !nationalbankidentification
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const plainBody = {
      latitude,
      longitude,
      mobilenumber,
      referenceno,
      ipaddress,
      adhaarnumber,
      accessmodetype,
      nationalbankidentification,
      requestremarks,
      data,
      pipe,
      timestamp,
      transactiontype: "MS",
      submerchantid,
      is_iris,
    };

    const encryptedBody = encrypt(plainBody);

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/ministatement/index",
      { body: encryptedBody },
      {
        headers,
        timeout: 180000,
      }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/ministatement/index",
      requestData: req.body,
      responseData: response.data,
    });
    return res.json(response.data);
  } catch (error) {
    return next(error);
  }
};

exports.getAepsBankList = async (req, res, next) => {
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/aeps/banklist/index",
      {},
      { headers }
    );
    logApiCall({
      url: "https://sit.paysprint.in/service-api/api/v1/service/aeps/banklist/index",
      requestData: {},
      responseData: response.data,
    });
    return res.json(response?.data?.banklist || []);
  } catch (error) {
    return next(error);
  }
};
