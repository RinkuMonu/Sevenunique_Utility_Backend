require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");


const CLIENT_ID = process.env.AEPS_CLIENT_ID;
const CLIENT_SECRET = process.env.AEPS_CLIENT_SECRET;
const PASS_KEY = process.env.AEPS_PASS_KEY;
const API_BASE = process.env.ISU_BASE_URL;

// Decode Base64 AES key from env
const AES_KEY = Buffer.from(process.env.AEPS_ENCR_KEY, "base64");


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
const { getApplicableServiceCharge, calculateCommissionFromSlabs, logApiCall } = require("../utils/chargeCaluate");
const DmtReport = require('../models/dmtTransactionModel');

// exports.initiatePayout = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

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
//       category,
//       mpin
//     } = req.body;

//     const userId = req.user.id;
//     const referenceId = `DMTEX${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

//     const user = await userModel.findOne({ _id: userId, status: true }).session(session);

//     if (!user) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ success: false, message: "User not found or inactive" });
//     }


//     if (user.mpin != mpin) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ success: false, message: "Please enter a vaild mpin" });
//     }

//     if (!beneName || !beneAccountNo || !beneifsc || !amount) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({ success: false, message: "Missing required details" });
//     }

//     // Get charges
//     const { commissions, service } = await getApplicableServiceCharge(userId, category);
//     let commission = commissions?.slabs?.length
//       ? calculateCommissionFromSlabs(amount, commissions)
//       : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

//     const usableBalance = Number(user.eWallet) - Number(user.cappingMoney || 0);
//     const required = Number(
//       (Number(amount) + Number(commission.charge) + Number(commission.gst) + Number(commission.tds) - Number(commission.retailer)).toFixed(2)
//     );

//     if (usableBalance < required) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: `Insufficient balance. Required: ₹${required}, Available: ₹${user.eWallet}`,
//       });
//     }

//     // Create payout record
//     const [payoutRecord] = await payOutModel.create(
//       [
//         {
//           userId,
//           amount,
//           reference: referenceId,
//           type: service?._id,
//           trans_mode: fundTransferType || "IMPS",
//           name: beneName,
//           mobile: custMobNo,
//           email: paramA || user.email,
//           status: "Pending",
//           account: beneAccountNo,
//           ifsc: beneifsc,
//           remark: "DMT EX initiated",
//           charges: commission.charge,
//           gst: commission.gst,
//           tds: commission.tds,
//           totalDebit: required,
//         },
//       ],
//       { session }
//     );

//     // Wallet txn
//     const [transactionRecord] = await Transaction.create(
//       [
//         {
//           user_id: userId,
//           transaction_type: "debit",
//           amount,
//           type: service?._id || category,
//           gst: commission.gst,
//           tds: commission.tds,
//           charge: commission.charge,
//           totalDebit: required,
//           totalCredit: commission.retailer,
//           balance_after: user.eWallet - required,
//           payment_mode: "wallet",
//           transaction_reference_id: referenceId,
//           description: `DMT EX initiated for ${beneName}`,
//           status: "Pending",
//         },
//       ],
//       { session }
//     );

//     // Create DMT report
//     const [dmtTransaction] = await DmtReport.create(
//       [
//         {
//           user_id: userId,
//           status: "Pending",
//           type: service._id,
//           referenceid: referenceId,
//           txn_status: "0",
//           benename: beneName,
//           remarks: "DMT EX initiated",
//           message: "DMT EX initiated",
//           remitter: benePhoneNo,
//           account_number: beneAccountNo,
//           gatewayCharges: {
//             txn_amount: parseFloat(amount),
//             customercharge: parseFloat(commission.charge),
//             gst: parseFloat(commission.gst),
//             tds: parseFloat(commission.tds),
//             netcommission: parseFloat(
//               commission.retailer + commission.distributor + commission.admin
//             ),
//           },
//           charges: commission.charge,
//           commission: { distributor: commission.distributor, admin: commission.admin },
//           gst: commission.gst,
//           tds: commission.tds,
//           amount,
//           totalDebit: required,
//         },
//       ],
//       { session }
//     );

//     // Deduct wallet
//     user.eWallet = Number(user.eWallet) - Number(required);
//     await user.save({ session });

//     // 👉 COMMIT EVERYTHING BEFORE API CALL
//     await session.commitTransaction();
//     session.endSession();

//     // Now generate token (outside transaction)
//     const tokenResponse = await axios.post(
//       "https://instantpayco.com/api/v1.1/generateToken",
//       new URLSearchParams({
//         clientKey: "bbps456udfg6",
//         clientSecret: "bbps456udfg6",
//       }),
//       { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//     );

//     const accessToken = tokenResponse?.data?.data?.access_token;

//     if (!accessToken) {
//       // If token failed → mark records failed
//       await payOutModel.findOneAndUpdate({ reference: referenceId }, { status: "Failed", remark: "Failed to fetch token" });
//       await Transaction.findOneAndUpdate({ transaction_reference_id: referenceId }, { status: "Failed", description: "Failed to fetch token", balance_after: user.eWallet });
//       await DmtReport.findOneAndUpdate({ referenceid: referenceId }, { status: "Failed", remarks: "Failed to fetch token" });

//       // Refund wallet
//       await userModel.findByIdAndUpdate(userId, { $inc: { eWallet: +required } });

//       return res.status(400).json({ success: false, message: "Technical issue, try later" });
//     }

//     // Prepare API body
//     const formData = new FormData();
//     formData.append("amount", amount);
//     formData.append("reference", referenceId);
//     formData.append("trans_mode", fundTransferType);
//     formData.append("account", beneAccountNo);
//     formData.append("beneBankName", beneBankName);
//     formData.append("ifsc", beneifsc);
//     formData.append("name", beneName);
//     formData.append("email", paramA || "");
//     formData.append("mobile", custMobNo);
//     formData.append("address", paramB || "");
//     if (pincode) formData.append("pincode", pincode);

//     // Hit payout API
//     let response;
//     try {
//       response = await axios.post("https://instantpayco.com/api/v1.1/payoutTransaction", formData, {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           ...formData.getHeaders(),
//         },
//       });
//     } catch (err) {
//       response = { data: { success: false, message: err.message || "API failed" } };
//     }

//     return res.status(200).json({
//       success: true,
//       data: response.data,
//     });

//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Error:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };






//  CALLBACK HANDLER
exports.payoutCallback = async (req, res) => {
  try {
    console.log("📥 Callback Received:", req.query, req.body);

    const { status, message, utr, reference, amount } = req.query;

    if (!status || !reference) {
      return res.status(400).json({ success: false, message: "Missing status or reference" });
    }

    const payout = await payOutModel.findOne({ reference: reference });
    const transaction = await Transaction.findOne({ transaction_reference_id: reference });
    const dmtReport = await DmtReport.findOne({ referenceid: reference });



    if (!payout || !transaction || !dmtReport) {
      return res.status(404).json({ success: false, message: "Records not found for callback" });
    }

    const user = await userModel.findById(payout.userId);

    if (status.toLowerCase() == "success") {
      payout.status = "Success";
      transaction.status = "Success";
      dmtReport.status = "Success";
      dmtReport.txn_status = "1";
      dmtReport.utr = utr || "";
      dmtReport.remarks = message || "Transaction successful";
      dmtReport.message = message || "Transaction successful";
      payout.remark = message || "Transaction successful";
      transaction.description = message || "Transaction successful";
    } else if (status.toLowerCase() == "failed") {
      if (user) {
        user.eWallet = Number(user.eWallet) + Number(payout.totalDebit || 0);
        await user.save();
      }
      payout.status = "Failed";
      transaction.status = "Failed";
      transaction.balance_after = user.eWallet,
        dmtReport.status = "Failed";
      dmtReport.remarks = message || "Transaction failed";
      dmtReport.message = message || "Transaction failed";
      payout.remark = message || "Transaction failed";
      transaction.description = message || "Transaction failed";
      // Refund wallet
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
//     const decrypted1 = decryptAES256(encPayload, AES_KEY);
//     console.log("RequestData:", encPayload);
//     console.log("RequestData:", decrypted1);

//     console.log("headers:", {
//       header_secrets: encHeaderSecrets,
//       pass_key: PASS_KEY
//     });
//     // return;
//     // API Call
//     const response = await axios.post(
//       "https://api-prod.txninfra.com/encrV1/w1w2-payout/w1/cashtransfer",
//       { RequestData: encPayload },
//       {
//         headers: {
//           header_secrets: encHeaderSecrets,
//           pass_key: PASS_KEY
//         },
//       }
//     );

//     console.log("📥 Raw Response:", response);

//     const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
//     logApiCall({ url: "/isu-po", requestData: { payload }, responseData: { decrypted } });
//     console.log("🔓 Decrypted Response:", decrypted);

//     return res.json({ success: true, data: JSON.parse(decrypted) });
//   } catch (err) {
//     console.error("❌ Payout Error:", err.response?.data || err.message);
//     return res
//       .status(500)
//       .json({ success: false, message: "Something went wrong" });
//   }
// };


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
      amount,
      fundTransferType = "IMPS",
      pincode,
      custName,
      custMobNo,
      custIpAddress,
      latlong,
      paramA,
      paramB,
      category,
      mpin,
    } = req.body;

    if (!beneName || !beneAccountNo || !beneifsc || !amount) {
      throw new Error("Missing required details");
    }
    const referenceId = `DMTEX${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;


    const payload = {
      beneName,
      beneAccountNo,
      beneifsc,
      benePhoneNo: Number(benePhoneNo),
      beneBankName,
      clientReferenceNo: referenceId,
      amount: Number(amount),
      fundTransferType,
      pincode: Number(pincode),
      custName,
      custMobNo: Number(custMobNo),
      custIpAddress,
      latlong,
      paramA: paramA || "",
      paramB: paramB || "",
    };

    const userId = req.user.id;

    const user = await userModel.findOne({ _id: userId, status: true }).session(session);
    if (!user) throw new Error("User not found or inactive");

    if (user.mpin != mpin) throw new Error("Invalid MPIN");


    const { commissions, service } = await getApplicableServiceCharge(userId, category);

    const commission = commissions?.slabs?.length
      ? calculateCommissionFromSlabs(amount, commissions)
      : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

    const required =
      Number(amount) +
      commission.charge +
      commission.gst +
      commission.tds -
      commission.retailer;

    const debitAmount = Number(required.toFixed(2));
    const usableBalance = user.eWallet - (user.cappingMoney || 0);

    if (usableBalance < required) {
      return res.status(400).json({
        error: true,
        message: `Insufficient wallet balance. Maintain ₹${user.cappingMoney}. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`,
      });
    }

    const updatedUser = await userModel.findOneAndUpdate(
      { _id: userId, eWallet: { $gte: debitAmount } },
      { $inc: { eWallet: -debitAmount } },
      { new: true, session }
    );

    if (!updatedUser) {
      throw new Error(`Insufficient balance. Required: ₹${debitAmount}, Available: ₹${user.eWallet}`);
    }

    await payOutModel.create(
      [
        {
          userId,
          amount,
          reference: referenceId,
          type: service?._id,
          trans_mode: fundTransferType,
          name: beneName,
          mobile: custMobNo,
          email: paramA || user.email,
          status: "Pending",
          account: beneAccountNo,
          ifsc: beneifsc,
          remark: "DMT EX initiated",
          charges: commission.charge,
          gst: commission.gst,
          tds: commission.tds,
          totalDebit: debitAmount,
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          user_id: userId,
          transaction_type: "debit",
          amount,
          type: service?._id || category,
          gst: commission.gst,
          tds: commission.tds,
          charge: commission.charge,
          totalDebit: debitAmount,
          totalCredit: commission.retailer,
          balance_after: updatedUser.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: referenceId,
          description: `DMT EX initiated for ${beneName}`,
          status: "Pending",
        },
      ],
      { session }
    );

    await DmtReport.create(
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
            customercharge: commission.charge,
            gst: commission.gst,
            tds: commission.tds,
            netcommission:
              commission.retailer + commission.distributor + commission.admin,
          },
          charges: commission.charge,
          commission: {
            distributor: commission.distributor,
            admin: commission.admin,
          },
          gst: commission.gst,
          tds: commission.tds,
          amount,
          totalDebit: debitAmount,
        },
      ],
      { session }
    );

    const headerSecrets = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      epoch: Math.floor(Date.now() / 1000).toString(),
    };

    const encHeaderSecrets = encryptAES256(JSON.stringify(headerSecrets), AES_KEY);
    const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

    const apiResponse = await axios.post(
      "https://api-prod.txninfra.com/encrV1/w1w2-payout/w1/cashtransfer",
      { RequestData: encPayload },
      { headers: { header_secrets: encHeaderSecrets, pass_key: PASS_KEY } }
    );

    const decrypted = decryptAES256(apiResponse.data.ResponseData, AES_KEY);
    const result = JSON.parse(decrypted);


    let finalStatus = "Pending";
    let txnStatus = "0";

    if (result.status === "SUCCESS") {
      finalStatus = "Success";
      txnStatus = "1";
    } else if (result.status === "FAILED") {
      finalStatus = "Failed";
      txnStatus = "2";
    }

    await payOutModel.updateOne(
      { reference: referenceId },
      {
        $set: {
          status: finalStatus,
          subStatus: result.subStatus,
          statusDesc: result.statusDesc,
          utr: result.rrn || "",
          transactionId: result.transactionId || "",
          api_response: result,
        },
      },
      { session }
    );

    await Transaction.updateOne(
      { transaction_reference_id: referenceId },
      {
        $set: {
          status: finalStatus,
          utr: result.rrn || "",
          message: result.statusDesc,
        },
      },
      { session }
    );

    await DmtReport.updateOne(
      { referenceid: referenceId },
      {
        $set: {
          status: finalStatus,
          txn_status: txnStatus,
          rrn: result.rrn || "",
          remarks: result.statusDesc,
          message: result.statusDesc,
          api_response: result,
        },
      },
      { session }
    );

    if (finalStatus === "Failed") {
      await userModel.updateOne(
        { _id: userId },
        { $inc: { eWallet: debitAmount } },
        { session }
      );
    }


    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: finalStatus === "Success",
      referenceId,
      status: finalStatus,
      apiResponse: result,
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("🔥 Payout Error:", error);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.fault?.faultstring || error.message,
    });
  }
};




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
