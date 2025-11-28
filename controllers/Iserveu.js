const { default: axios } = require("axios");
const CryptoJS = require("crypto-js");
require("dotenv").config();
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const userModel = require("../models/userModel");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../utils/chargeCaluate");
const AEPSTransaction = require("../models/aepsModels/withdrawalEntry");
const Transaction = require("../models/transactionModel");
const payInModel = require("../models/payInModel");
const { distributeCommission } = require("../utils/distributerCommission");
const CommissionTransaction = require("../models/CommissionTransaction");
const matmModel = require("../models/matm.model");


const { AEPS_PASS_KEY, AEPS_CLIENT_ID, AEPS_CLIENT_SECRET, AEPS_ENCR_KEY } =
  process.env;

exports.getToken = (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = JSON.stringify({
      client_id: process.env.AEPS_CLIENT_ID,
      client_secret: process.env.AEPS_CLIENT_SECRET,
      epoch: timestamp.toString(),
    });

    const key = process.env.AEPS_ENCR_KEY; // base64 encoded
    const decodedKey = CryptoJS.enc.Base64.parse(key);

    // Generate random IV (16 bytes)
    const iv = CryptoJS.lib.WordArray.random(16);

    // AES-256-CBC encryption
    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(payload),
      decodedKey,
      {
        iv: iv,
        padding: CryptoJS.pad.Pkcs7,
        mode: CryptoJS.mode.CBC,
      }
    );

    // Combine IV + ciphertext, then encode in Base64
    const combined = iv.concat(encrypted.ciphertext);
    const encryptedToken = CryptoJS.enc.Base64.stringify(combined);
    console.log("encryptedToken---", encryptedToken);
    // return;
    res.json({
      token: encryptedToken,
      pass_key: process.env.AEPS_PASS_KEY,
      apiusername: process.env.AEPS_API_USERNAME,
      username: process.env.AEPS_USERNAME,
    });
  } catch (err) {
    console.error("Token generation error:", err);
    res.status(500).json({ status: 1, statusDesc: "Token generation failed" });
  }
};

// 🔹 Callback Handler
exports.aepsCallback = async (req, res) => {
  console.log("AEPS Callback Data:", req.body);
  const session = await mongoose.startSession();
  session.startTransaction();
  try {

    const {
      statusDesc,
      productCode,
      txnType,
      txnAmount,
      customeridentIfication,
      status,
      txnId,
      rrn,
      username,
      clientRefID
    } = req.body;

    const user = await userModel.findOne({ UserId: username }).session(session);
    if (!user) throw new Error("User not found");

    let category = null;

    // Category mapping
    if (txnType === "AEPS_CASH_WITHDRAWAL") {
      category = "6918314027e9c0be214ff15d";
    } else {
      category = "68c9369d8fa1dda33eb541b6";
    }



    let commission = {
      charge: 0,
      gst: 0,
      tds: 0,
      retailer: 0,
      distributor: 0,
      admin: 0,
    };

    let required = 0;

    const { commissions, service } = await getApplicableServiceCharge(user._id, category);

    if (txnType === "AEPS_CASH_WITHDRAWAL" || txnType === "AEPS_CASH_DEPOSIT") {

      commission = commissions
        ? calculateCommissionFromSlabs(txnAmount, commissions)
        : commission;
    }

    required =
      Number(txnAmount) +
      Number(commission.charge) +
      Number(commission.tds) +
      Number(commission.gst) -
      Number(commission.retailer);

    const usableBalance = user.eWallet - (user.cappingMoney || 0);

    if (status === "SUCCESS" && txnType === "AEPS_CASH_DEPOSIT") {
      // For deposit wallet deduction
      if (usableBalance < required) {
        await session.abortTransaction();
        return res.status(400).json({
          error: true,
          message: `Insufficient wallet balance. Required: ₹${required}, Available: ₹${usableBalance}`
        });
      }
    }


    await AEPSTransaction.create([{
      userId: user._id,
      balance_after: user.eWallet,
      type: txnType,
      mobilenumber: user.mobileNumber,
      adhaarnumber: customeridentIfication,
      amount: txnAmount,
      clientrefno: clientRefID,
      bankrrn: rrn,
      status,
      charges: commission.charge,
      gst: commission.gst,
      tds: commission.tds,
      retailerCommission: commission.retailer,
      distributorCommission: commission.distributor,
      adminCommission: commission.admin,
      apiResponse: req.body
    }], { session });


    if (txnType === "AEPS_MINI_STATEMENT" || txnType === "AEPS_BALANCE_ENQUIRY") {

      const rewardAmount = Number(
        txnType === "AEPS_MINI_STATEMENT"
          ? commissions?.aepsMiniStatement
          : commissions?.aepsBalanceEnquiry
      ) || 0;

      if (Number(rewardAmount) > 0) {

        // Wallet reward credit
        if (status === "SUCCESS") {
          user.eWallet += Number(rewardAmount);
          await user.save({ session });
        }

        // Create reward transaction
        await Transaction.create([{
          user_id: user._id,
          transaction_type: "credit",
          type: service._id,
          amount: 0,
          totalCredit: rewardAmount,
          balance_after: user.eWallet,
          description: `${txnType} Reward`,
          status,
          transaction_reference_id: clientRefID
        }], { session });
      }

      await session.commitTransaction();
      return res.status(200).json({
        status: true,
        message: `${txnType} processed`,
        rewardGiven: Number(rewardAmount) > 0 ? rewardAmount : 0
      });
    }


    if (status !== "SUCCESS") {

      await Transaction.create([{
        user_id: user._id,
        transaction_type: txnType === "AEPS_CASH_DEPOSIT" ? "debit" : "credit",
        type: service._id,
        amount: txnAmount,
        balance_after: user.eWallet,
        status: status,
        description: `AEPS ${txnType} Failed`,
        transaction_reference_id: clientRefID
      }], { session });

      await session.commitTransaction();
      return res.status(200).json({
        status: false,
        message: `${txnType} Failed`
      });
    }

    if (txnType === "AEPS_CASH_WITHDRAWAL") {
      user.eWallet += Number(required);
      await user.save({ session });
    }

    if (txnType === "AEPS_CASH_DEPOSIT") {
      user.eWallet -= required;
      await user.save({ session });
    }

    // Transaction Entry
    await Transaction.create([{
      user_id: user._id,
      transaction_type: txnType === "AEPS_CASH_DEPOSIT" ? "debit" : "credit",
      type: service._id,
      amount: txnAmount,
      totalCredit: Number(commissions.retailer || 0),
      totalDebit: required,
      charge: commission.charge,
      balance_after: user.eWallet,
      gst: commission.gst,
      tds: commission.tds,
      transaction_reference_id: clientRefID,
      description: `AEPS ${txnType}`,
      status
    }], { session });

    if (txnType === "AEPS_CASH_WITHDRAWAL" || txnType === "AEPS_CASH_DEPOSIT") {
      await distributeCommission({
        user: user._id,
        distributer: user.distributorId,
        service,
        transferAmount: txnAmount,
        commission,
        reference: clientRefID,
        description: "AEPS Commission",
        session
      });
    }

    await session.commitTransaction();
    res.status(200).json({ status: true, message: `${txnType} Success` });

  } catch (err) {
    console.log("Callback Error:", err);
    await session.abortTransaction();
    res.status(500).json({ status: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// 🔹 Callback Handler
exports.matmCallback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("mATM Callback Data:", req.body);

    const data = req.body;

    // Save raw callback
    await MatmCallback.create({
      statusDesc: data.statusDesc,
      productCode: data.productCode,
      txnType: data.txnType,
      txnAmount: Number(data.txnAmount || 0),
      txnDateTime: data.txnDateTime || "",
      customerIdentification: data.customeridentIfication,
      status: data.status,
      rrn: data.rrn,
      txnId: data.txnId,
      username: data.username,
      clientRefID: data.clientRefID,
      param_b: data.param_b,
      param_c: data.param_c,
      deviceSerialNo: data.device_serial_no,
      mobileNumber: data.mobile_number,
      balanceAmount: data.balance_amount,
      rawData: data
    });

    const user = await userModel.findOne({
      UserId: data.username
    }).session(session);

    if (!user) {
      throw new Error("User not found for this Outlet ID");
    }

    const userId = user._id;


    let txnAmount = Number(data.txnAmount || 0);

    // SUCCESS CHECK
    if (data.status !== "AUTH_SUCCESS") {
      await matmModel.create({
        userId,
        txnType: data.txnType,
        productCode: data.productCode,
        amount: txnAmount,
        mobile: data.mobile,
        rrn: data.rrn,
        customeridentIfication: customeridentIfication.rrn,
        clientRefID: data.clientRefID,
        txnId: data.txnId,
        status: data.status,
        balance_after: user.eWallet,
        description: data.statusDesc || "mATM Transaction Failed"
      });

      await session.commitTransaction();
      return res.json({ status: 0, message: "Transaction Failed" });
    }

    // Get mATM commission slab
    const categoryId = "6918432258971284f348b5c8";
    const { commissions, service } = await getApplicableServiceCharge(userId, categoryId);

    const commission =
      commissions ? calculateCommissionFromSlabs(txnAmount, commissions) : {
        retailer: 0,
        distributor: 0,
        admin: 0,
        charge: 0,
        tds: 0,
        gst: 0
      };

    const required = Number((Number(data.txnAmount) + Number(commission.charge || 0) + Number(commission.gst || 0) + Number(commission.tds || 0) - Number(commission.retailer || 0)).toFixed(2));

    user.eWallet += Number(commission.required || 0);
    await user.save({ session });

    // Save wallet transaction entry
    await Transaction.create([{
      user_id: userId,
      transaction_type: "credit",
      type: service?._id,
      amount: txnAmount,
      totalCredit: required,
      totalDebit: Number(commission.charge || 0) + Number(commission.tds || 0) + Number(commission.gst || 0),
      charge: commission.charge,
      gst: commission.gst,
      tds: commission.tds,
      balance_after: user.eWallet,
      description: data.statusDesc || "mATM Transaction Reward",
      transaction_reference_id: data.clientRefID,
      status: data.status
    }], { session });

    // Save mATM transaction report
    await matmModel.create({
      userId,
      txnType: data.txnType,
      amount: txnAmount,
      rrn: data.rrn,
      clientRefID: data.clientRefID,
      status: data.status,
      balance_after: user.eWallet,
      retailerCommission: commission.retailer,
      distributorCommission: commission.distributor,
      adminCommission: commission.admin,
      description: data.statusDesc || "mATM Transaction Successful"
    });

    await distributeCommission({
      user: userId,
      distributer: user.distributorId,
      service,
      transferAmount: txnAmount,
      commission,
      reference: externalRef,
      description: data.statusDesc || "Commission for AEPS Cash Withdrawal",
      session
    });

    await session.commitTransaction();
    res.json({ status: 1, message: "Success" });

  } catch (err) {
    console.error("mATM Callback Error:", err);
    await session.abortTransaction();
    res.status(500).json({ status: 0, message: err.message });
  } finally {
    session.endSession();
  }
};

// Excel Mapping Function
const mapUserToExcel = ({ ...user }) => {
  return {
    bcagentid: user?.UserId || "",
    bcagentname: user?.name || "",
    lastname: user?.name?.split(" ").slice(-1)[0] || "",
    companyname: user?.shopName || "",
    address: user?.address?.block || "",
    area: user?.address?.block || "",
    pincode: user?.pinCode || "",
    mobilenumber: user.mobileNumber || "",
    shopname: user.shopName || "",
    shopaddress: user?.address?.block || "",
    shopstate: user?.address?.state || "",
    shopcity: user.address?.city || "",
    shopdistrict: user?.aadharDetails?.data?.address?.dist || "",
    shoppincode: user.pincode || "",
    pancard: user.panDetails?.pan_number || "",
    email: user.email || "",
    aadhaar: user?.aadharDetails?.data?.aadhaar_number || "",
    lat: user.latitude || "",
    long: user.longitude || "",
    apiusername: user.apiUsername || "",
  };
};

exports.sendAepsExcelMail = async (req, res) => {
  try {
    const { user } = req.body;

    if (!user) {
      return res.status(400).json({ message: "User data missing" });
    }
    // console.log("User Data for AEPS Excel Mail:", user);

    // 1️⃣ Excel Row
    const excelData = [mapUserToExcel(user)];
    // console.log("Mapped Excel Data:", excelData);
    // return;

    // 2️⃣ Excel Sheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AEPS_DATA");

    // 3️⃣ Excel buffer → base64 convert
    const excelBuffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    });

    const excelBase64 = excelBuffer.toString("base64");

    // 4️⃣ Prepare Msg91 Payload
    const payload = {
      recipients: [
        {
          to: [
            {
              name: "Admin",
              email: "niranjan@7unique.in",
            },
          ],
          variables: {
            company_name: "SevenUnique Tech Solutions Pvt Ltd",
            name: user.name,
            login_time: new Date().toISOString(),
          },
        },
      ],
      from: {
        name: "SevenUnique",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      // template_id: "global_otp",

      attachments: [
        {
          name: "AEPS_User_onboarding_Data.xlsx",
          content: excelBase64,
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    };

    // 5️⃣ Send Email via Msg91
    try {
      const response = await axios.post(
        "https://control.msg91.com/api/v5/email/send",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            authkey: "415386Amp14kbEfs65c49c94P1",
          },
        }
      );

      return res.json({
        message: "AEPS Excel Email Sent!",
        response: response.data,
      });
    } catch (error) {
      console.error("Error sending AEPS Excel Mail:", error);
      return res.status(500).json({ message: "sending AEPS Excel Mail" });
    }
  } catch (err) {
    console.log("Failed to send AEPS mail", err);
    res.status(500).json({ message: "Failed to send AEPS mail" });
  }
};
