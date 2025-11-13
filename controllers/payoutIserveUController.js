const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");


const CLIENT_ID = process.env.ISU_CLIENT_ID;
const CLIENT_SECRET = process.env.ISU_CLIENT_SECRET;
const PASS_KEY = process.env.ISU_PASS_KEY;
const API_BASE = process.env.ISU_BASE_URL;

// Decode Base64 AES key from env
const AES_KEY = Buffer.from(process.env.ISU_AES_KEY_BASE64, "base64");

// ========================
// 🔐 AES ENCRYPT/DECRYPT
// ========================
function encryptAES256(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  // Prepend IV
  return Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString(
    "base64"
  );
}

function decryptAES256(text, key) {
  const rawData = Buffer.from(text, "base64");
  const iv = rawData.subarray(0, 16);
  const encryptedData = rawData.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedData, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Generate Token Controller
exports.generateToken = async (req, res) => {
  try {
    const data = qs.stringify({
      authKey: "UTI6tamscw",
      authSecret: "4jtudpz0ri1x2t@y",
    });

    const response = await axios.post(
      "https://admin.finuniques.in/api/v1.1/t1/oauth/token",
      data,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const token = response.data?.token;
    console.log("Generated Token payout ka :", token);

    if (!token) {
      return res
        .status(400)
        .json({ message: "Token not received", response: response.data });
    }

    // Save token in session
    req.session.token = token;

    res.status(200).json({
      success: true,
      message: "Token generated successfully",
      token,
    });
  } catch (error) {
    console.error(
      "Token Generation Error:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to generate token",
      error: error.response?.data || error.message,
    });
  }
};

const FormData = require("form-data");
const userModel = require("../models/userModel");
const { default: mongoose } = require("mongoose");
const Transaction = require("../models/transactionModel");
const payOutModel = require("../models/payOutModel");
const { response } = require("express");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../utils/chargeCaluate");
const DmtReport = require('../models/dmtTransactionModel');

exports.initiatePayout = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      beneName,
      beneAccountNo,
      beneifsc,
      benePhoneNo,
      beneBankName,
      clientReferenceNo,
      amount,
      fundTransferType,
      pincode,
      custName,
      custMobNo,
      custIpAddress,
      latlong,
      paramA,
      paramB,
      type = "690314decc20a7e1a531cd05",
    } = req.body;

    const userId = req.user.id;
    const referenceId = `DMTEX${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const user = await userModel.findOne({ _id: userId, status: true }).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "User not found or inactive" });
    }

    if (!beneName || !beneAccountNo || !beneifsc || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Missing required payout details" });
    }

    // 🔹 Fetch service charges and commissions
    const { commissions, service } = await getApplicableServiceCharge(userId, type);
    let commission;
    if (commissions?.slabs?.length > 0) {
      commission = calculateCommissionFromSlabs(amount, commissions);
    } else {
      commission = { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0, totalCommission: 0 };
    }

    const usableBalance = Number(user.eWallet) - Number(user.cappingMoney || 0);
    const required = Number(
      (Number(amount) + Number(commission.charge || 0) + Number(commission.gst || 0) + Number(commission.tds || 0)).toFixed(2)
    );

    // 🔹 Check wallet balance
    if (usableBalance < required) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Maintain ₹${user.cappingMoney || 0}. Available: ₹${user.eWallet}, Required: ₹${required}`,
      });
    }

    // 🔹 Step 1: Create initial "Pending" payout record
    const [payoutRecord] = await payOutModel.create(
      [
        {
          userId,
          amount: Number(amount),
          reference: referenceId,
          type: service?._id,
          trans_mode: fundTransferType || "IMPS",
          name: beneName,
          mobile: custMobNo,
          email: paramA || user.email,
          status: "Pending",
          account: beneAccountNo,
          ifsc: beneifsc,
          remark: "DMT EX initiated",
          charges: commission.charge || 0,
          gst: commission.gst || 0,
          tds: commission.tds || 0,
          totalDebit: required,
        },
      ],
      { session }
    );

    // 🔹 Step 2: Create wallet transaction
    const [transactionRecord] = await Transaction.create(
      [
        {
          user_id: userId,
          transaction_type: "debit",
          amount: Number(amount),
          type: service?._id || type,
          gst: Number(commission.gst || 0),
          tds: Number(commission.tds || 0),
          charge: Number(commission.charge || 0),
          totalDebit: Number(required),
          balance_after: user.eWallet - Number(required),
          payment_mode: "wallet",
          transaction_reference_id: referenceId,
          description: `DMT EX initiated for ${beneName}`,
          status: "Pending",
        },
      ],
      { session }
    );

    // 🔹 Step 3: Create DMT report
    const [dmtTransaction] = await DmtReport.create(
      [
        {
          user_id: userId,
          status: "Pending",
          type: service._id,
          referenceid: referenceId,
          txn_status: "0",
          benename: beneName,
          remarks: "DMT EX initiated",
          message: "DMT EX initiated",
          remitter: benePhoneNo,
          account_number: beneAccountNo,
          gatewayCharges: {
            txn_amount: parseFloat(amount),
            customercharge: parseFloat(commission.charge || 0),
            gst: parseFloat(commission.gst || 0),
            tds: parseFloat(commission.tds || 0),
            netcommission: parseFloat(
              commission.retailer + commission.distributor + commission.admin || 0
            ),
          },
          charges: commission.charge,
          commission: { distributor: commission.distributor, admin: commission.admin },
          gst: commission.gst,
          tds: commission.tds,
          amount: amount,
          totalDebit: required,
        },
      ],
      { session }
    );

    // 🔹 Deduct wallet (lock funds)
    user.eWallet = Number(user.eWallet) - Number(required);
    await user.save({ session });

    // 🔹 Generate API token
    const tokenResponse = await axios.post(
      "https://instantpayco.com/api/v1.1/generateToken",
      new URLSearchParams({
        clientKey: "bbps456udfg6",
        clientSecret: "bbps456udfg6",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse?.data?.data?.access_token;
    if (!accessToken) {
      user.eWallet = Number(user.eWallet) + Number(required);
      await user.save({ session });
      payoutRecord.status = "Failed";
      transactionRecord.status = "Failed";
      dmtTransaction.status = "Failed";
      dmtTransaction.remarks = "Failed to fetch token";
      await payoutRecord.save({ session });
      await transactionRecord.save({ session });
      await dmtTransaction.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Technical issue, try again later" });
    }

    // 🔹 Prepare payout API request
    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("reference", referenceId || clientReferenceNo);
    formData.append("trans_mode", fundTransferType);
    formData.append("account", beneAccountNo);
    formData.append("beneBankName", beneBankName);
    formData.append("ifsc", beneifsc);
    formData.append("name", beneName);
    formData.append("email", paramA || "");
    formData.append("mobile", custMobNo);
    formData.append("address", paramB || "");
    if (pincode) formData.append("pincode", pincode);

    // 🔹 Call payout API
    let response;
    try {
      response = await axios.post("https://instantpayco.com/api/v1.1/payoutTransaction", formData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...formData.getHeaders(),
        },
      });
    } catch (apiError) {
      response = {
        status: 500,
        data: { success: false, message: apiError.response?.data?.message || "DMT EX API failed" },
      };
    }

    console.log("✅ DMT EX Response:", response.data);

    // Always mark "Pending" — status will be updated via callback
    await payoutRecord.save({ session });
    await transactionRecord.save({ session });
    await dmtTransaction.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "DMT EX initiated successfully. Awaiting callback confirmation.",
      data: response.data,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ DMT EX Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while processing DMT EX",
    });
  }
};

// ============================================================
// 🔹 CALLBACK HANDLER
// ============================================================
exports.payoutCallback = async (req, res) => {
  try {
    console.log("📥 Callback Received:", req.query, req.body);

    const { status, message, utr, reference, amount } = req.query;

    if (!status || !reference) {
      return res.status(400).json({ success: false, message: "Missing status or reference" });
    }

    const payout = await payOutModel.findOne({ reference });
    const transaction = await Transaction.findOne({ transaction_reference_id: reference });
    const dmtReport = await DmtReport.findOne({ referenceid: reference });

    if (!payout || !transaction || !dmtReport) {
      return res.status(404).json({ success: false, message: "Records not found for callback" });
    }

    const user = await userModel.findById(payout.userId);

    if (status.toLowerCase() === "success") {
      payout.status = "Success";
      transaction.status = "Success";
      dmtReport.status = "Success";
      dmtReport.txn_status = "1";
      dmtReport.utr = utr || "";
      dmtReport.remarks = message || "Transaction successful";
      dmtReport.message = message || "Transaction successful";
    } else if (status.toLowerCase() === "failed") {
      payout.status = "Failed";
      transaction.status = "Failed";
      dmtReport.status = "Failed";
      dmtReport.remarks = message || "Transaction failed";
      dmtReport.message = message || "Transaction failed";
      // Refund wallet
      if (user) {
        user.eWallet = Number(user.eWallet) + Number(payout.totalDebit || 0);
        await user.save();
      }
    } else {
      payout.status = "Pending";
      transaction.status = "Pending";
      dmtReport.status = "Pending";
    }

    await payout.save();
    await transaction.save();
    await dmtReport.save();

    return res.status(200).json({ success: true, message: `Callback processed: ${status}` });
  } catch (error) {
    console.error("❌ Callback Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error in callback" });
  }
};

// ========================
// 🟢 1. Payout Initiate

// exports.initiatePayout = async (req, res) => {
//   try {
//     const {
//       beneName,
//       beneAccountNo,
//       beneifsc,
//       benePhoneNo,
//       beneBankName,
//       clientReferenceNo,
//       amount,
//       fundTransferType,
//       pincode,
//       custName,
//       custMobNo,
//       custIpAddress,
//       latlong,
//       paramA,
//       paramB,
//     } = req.body;

//     console.log("📤 Initiating Payout with:", req.body);

//     // Header Secrets
//     const headerSecrets = {
//       client_id: CLIENT_ID,
//       client_secret: CLIENT_SECRET,
//       epoch: Math.floor(Date.now() / 1000).toString(),
//     };
//     const encHeaderSecrets = encryptAES256(
//       JSON.stringify(headerSecrets),
//       AES_KEY
//     );

//     // Payload
//     const payload = {
//       beneName,
//       beneAccountNo,
//       beneifsc,
//       benePhoneNo: Number(benePhoneNo),
//       beneBankName,
//       clientReferenceNo,
//       amount: Number(amount),
//       fundTransferType,
//       pincode: Number(pincode),
//       custName,
//       custMobNo: Number(custMobNo),
//       custIpAddress,
//       latlong,
//       paramA: paramA || "",
//       paramB: paramB || "",
//     };

//     const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

//     // API Call
//     const response = await axios.post(
//       `${API_BASE}/w1w2-payout/w1/cashtransfer`,
//       { RequestData: encPayload },
//       {
//         headers: {
//           pass_key: PASS_KEY,
//           header_secrets: encHeaderSecrets,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     console.log("📥 Raw Response:", response.data);

//     const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
//     console.log("🔓 Decrypted Response:", decrypted);

//     return res.json({ success: true, data: JSON.parse(decrypted) });
//   } catch (err) {
//     console.error("❌ Payout Error:", err.response?.data || err.message);
//     return res
//       .status(500)
//       .json({ success: false, message: "Something went wrong" });
//   }
// };

// ========================
// 🟢 2. Callback
// ========================
// exports.payoutCallback = async (req, res) => {
//   try {
//     console.log("📥 Callback Received Raw:", req.body);

//     const { ResponseData } = req.body;
//     const decrypted = decryptAES256(ResponseData, AES_KEY);
//     const data = JSON.parse(decrypted);

//     console.log("🔓 Decrypted Callback Data:", data);

//     // TODO: Save/update DB transaction status

//     return res.json({ success: true });
//   } catch (err) {
//     console.error("❌ Callback Error:", err.message);
//     return res.status(500).json({ success: false });
//   }
// };

/**
 * @desc Send payout transaction
 * @route POST /api/payout
 */

// ========================
// 🟢 3. Check Status
// ========================
exports.checkStatus = async (req, res) => {
  try {
    const { clientReferenceNo } = req.body;
    console.log("📤 Checking Status for:", clientReferenceNo);

    // Header Secrets
    const headerSecrets = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      epoch: Math.floor(Date.now() / 1000).toString(),
    };
    console.log(
      "🕒 Epoch Sent:",
      headerSecrets.epoch,
      typeof headerSecrets.epoch
    );
    const encHeaderSecrets = encryptAES256(
      JSON.stringify(headerSecrets),
      AES_KEY
    );

    const payload = { clientReferenceNo };
    const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

    console.log("🔒 Encrypted Status Payload:", encPayload);

    const response = await axios.post(
      `https://apidev-sdk.iserveu.online/w1w2-payout/w1/cashtransfer/payout/status`,
      { RequestData: encPayload },
      {
        headers: {
          pass_key: PASS_KEY,
          header_secrets: encHeaderSecrets,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📥 Raw Status Response:", response.data);

    const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
    console.log("🔓 Decrypted Status Response:", decrypted);

    return res.json({ success: true, data: JSON.parse(decrypted) });
  } catch (err) {
    console.error("❌ Status Check Error:", err.response?.data || err.message);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};
