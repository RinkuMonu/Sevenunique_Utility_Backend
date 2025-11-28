const { default: axios } = require("axios");
const CryptoJS = require("crypto-js");
require("dotenv").config();
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");
const path = require("path");
const userModel = require("../models/userModel");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, calculateCommissionFromSlabs, logApiCall } = require("../utils/chargeCaluate");
const AEPSTransaction = require("../models/aepsModels/withdrawalEntry");
const Transaction = require("../models/transactionModel");
const { distributeCommission } = require("../utils/distributerCommission");
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
  logApiCall({ url: "/aepsCallback", requestData: {}, responseData: req.body });

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


    const txnTypeMap = {
      AEPS_CASH_WITHDRAWAL: "Withdrawal",
      AEPS_CASH_DEPOSIT: "Deposit",
      AEPS_BALANCE_ENQUIRY: "BalanceEnquiry",
      AEPS_MINI_STATEMENT: "MiniStatement",
    };

    const finalType = txnTypeMap[txnType] || "Unknown";


    const statusMap = {
      SUCCESS: "Success",
      AUTH_SUCCESS: "Success",
      TXN: "Success",
      FAILED: "Failed",
      AUTH_FAILED: "Failed",
      FAILURE: "Failed",
    };


    const finalStatus = statusMap[status] || "Pending";


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
      type: finalType,
      mobilenumber: user.mobileNumber,
      adhaarnumber: customeridentIfication,
      amount: txnAmount,
      clientrefno: clientRefID,
      bankrrn: rrn,
      status: finalStatus,
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
          status: finalStatus,
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
        status: finalStatus,
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
      status: finalStatus
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

  logApiCall({ url: "/m-atmCallback", requestData: {}, responseData: req.body });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("mATM Callback Data:", req.body);
    const data = req.body;

    // USER FIND
    const user = await userModel.findOne({
      UserId: data.username
    }).session(session);

    if (!user) throw new Error("User not found for this Outlet ID");

    const userId = user._id;
    const txnAmount = Number(data.txnAmount || 0);

    // 🔹 STATUS MAPPING
    const statusMap = {
      AUTH_SUCCESS: "Success",
      SUCCESS: "Success",
      FAILED: "Failed",
      AUTH_FAILED: "Failed"
    };
    const finalStatus = statusMap[data.status] || "Pending";

    // 🔹 TYPE MAPPING
    const txnTypeMap = {
      mATM_BALANCE_ENQUIRY: "BalanceEnquiry",
      mATM_CASH_WITHDRAWAL: "Withdrawal",
    };
    const finalType = txnTypeMap[data.txnType] || "Unknown";


    if (data.txnType === "mATM_BALANCE_ENQUIRY") {

      await matmModel.create({
        userId,
        txnType: finalType,
        productCode: data.productCode,
        amount: 0,
        mobile: data.mobile_number,
        rrn: data.rrn,
        customeridentIfication: data.customeridentIfication,
        clientRefID: data.clientRefID,
        txnId: data.txnId,
        status: finalStatus,
        balance_after: user.eWallet,
        description: data.statusDesc || "mATM Balance Enquiry"
      });

      await session.commitTransaction();
      return res.json({ status: 1, message: "Balance Enquiry Saved" });
    }


    if (finalStatus !== "Success") {
      await matmModel.create({
        userId,
        txnType: finalType,
        productCode: data.productCode,
        amount: txnAmount,
        mobile: data.mobile_number,
        rrn: data.rrn,
        customeridentIfication: data.customeridentIfication,
        clientRefID: data.clientRefID,
        txnId: data.txnId,
        status: finalStatus,
        balance_after: user.eWallet,
        description: data.statusDesc || "mATM Cash Withdrawal Failed",
      });

      await session.commitTransaction();
      return res.json({ status: 0, message: "Transaction Failed" });
    }

    const categoryId = "6918432258971284f348b5c8";
    const { commissions, service } = await getApplicableServiceCharge(userId, categoryId);

    const commission = commissions
      ? calculateCommissionFromSlabs(txnAmount, commissions)
      : {
        retailer: 0,
        distributor: 0,
        admin: 0,
        charge: 0,
        gst: 0,
        tds: 0
      };
    const required = Number((Number(data.txnAmount) + Number(commission.charge || 0) + Number(commission.gst || 0) + Number(commission.tds || 0) - Number(commission.retailer || 0)).toFixed(2));

    user.eWallet += Number(required || 0);
    await user.save({ session });

    await Transaction.create([{
      user_id: userId,
      transaction_type: "credit",
      type: service?._id,
      amount: txnAmount,
      totalCredit: required,
      balance_after: user.eWallet,
      charge: commission.charge,
      gst: commission.gst,
      tds: commission.tds,
      description: data.statusDesc || "mATM Cash Withdrawal Commission",
      transaction_reference_id: data.clientRefID,
      status: finalStatus
    }], { session });


    await matmModel.create({
      userId,
      txnType: finalType,
      amount: txnAmount,
      rrn: data.rrn,
      clientRefID: data.clientRefID,
      status: finalStatus,
      balance_after: user.eWallet,
      retailerCommission: commission.retailer,
      distributorCommission: commission.distributor,
      adminCommission: commission.admin,
      description: data.statusDesc || "mATM Cash Withdrawal Successful",
    });

    await distributeCommission({
      user: userId,
      distributer: user.distributorId,
      service,
      transferAmount: txnAmount,
      commission,
      reference: data.clientRefID,
      description: data.statusDesc || "mATM Cash Withdrawal Commission",
      session
    });

    await session.commitTransaction();
    return res.json({ status: 1, message: "Cash Withdrawal Success" });

  } catch (err) {
    console.error("mATM Callback Error:", err);
    await session.abortTransaction();
    return res.status(500).json({ status: 0, message: err.message });
  } finally {
    session.endSession();
  }
};

exports.getMatmReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", status, txnType, startDate, endDate } = req.query;

    const query = {};

    // search by rrn, clientRefID, mobile, txnId
    if (search) {
      query.$or = [
        { rrn: new RegExp(search, "i") },
        { clientRefID: new RegExp(search, "i") },
        { txnId: new RegExp(search, "i") },
        { mobile: new RegExp(search, "i") },
      ];
    }

    if (status) query.status = status;
    if (txnType) query.txnType = txnType;

    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      matmModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      matmModel.countDocuments(query),
    ]);

    res.json({
      status: true,
      page: Number(page),
      limit: Number(limit),
      total,
      data
    });

  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};


// Excel Mapping Function

exports.sendAepsExcelMail = async (req, res) => {
  try {
    // ✅ 1. SAFE BODY PARSING
    const formData = req.body?.formData;
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    const userId = req.user.id;
    const user = await userModel.findById(userId).select("isOnBoardEmailSend");
    console.log(user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.isOnBoardEmailSend === true) {
      return res.status(400).json({
        success: false,
        message: "Onboarding mail already sent",
      });
    }
    if (!formData || typeof formData !== "object") {
      return res.status(400).json({
        success: false,
        message: "Unknown/Missing data",
      });
    }

    // ✅ 2. REQUIRED FIELD VALIDATION
    const requiredFields = [
      "bcagentid",
      "bcagentname",
      "companyname",
      "mobilenumber",
      "email",
      "lat",
      "long",
    ];

    for (let field of requiredFields) {
      if (!formData[field] || String(formData[field]).trim() === "") {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    const safeData = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [
        key,
        String(value || "")
          .toString()
          .trim(),
      ])
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("BC Agent Data");

    worksheet.columns = [
      { header: "bcagentid", key: "bcagentid" },
      { header: "bcagentname", key: "bcagentname" },
      { header: "lastname", key: "lastname" },
      { header: "companyname", key: "companyname" },
      { header: "address", key: "address" },
      { header: "area", key: "area" },
      { header: "pincode", key: "pincode" },
      { header: "mobilenumber", key: "mobilenumber" },
      { header: "shopname", key: "shopname" },
      { header: "shopaddress", key: "shopaddress" },
      { header: "shopstate", key: "shopstate" },
      { header: "shopcity", key: "shopcity" },
      { header: "shopdistrict", key: "shopdistrict" },
      { header: "shoparea", key: "shoparea" },
      { header: "shoppincode", key: "shoppincode" },
      { header: "pancard", key: "pancard" },
      { header: "email", key: "email" },
      { header: "AADHAAR", key: "AADHAAR" },
      { header: "lat", key: "lat" },
      { header: "long", key: "long" },
      { header: "apiusername", key: "apiusername" },
    ];

    worksheet.addRow({
      bcagentid: safeData.bcagentid,
      bcagentname: safeData.bcagentname,
      lastname: safeData.lastname,
      companyname: safeData.companyname,
      address: safeData.address,
      area: safeData.area,
      pincode: safeData.pincode,
      mobilenumber: safeData.mobilenumber,
      shopname: safeData.shopname,
      shopaddress: safeData.shopaddress,
      shopstate: safeData.shopstate,
      shopcity: safeData.shopcity,
      shopdistrict: safeData.shopdistrict,
      shoparea: safeData.shoparea,
      shoppincode: safeData.shoppincode,
      pancard: safeData.pancard,
      email: safeData.email,
      AADHAAR: safeData.AADHAAR,
      lat: safeData.lat,
      long: safeData.long,
      apiusername: safeData.apiusername,
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // ✅ 5. SAFE SMTP CONFIG (NO HARDCODED CREDENTIALS)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });

    await transporter.verify();

    // ✅ 7. SEND EMAIL SAFELY
    await transporter.sendMail({
      from: `"SevenUnique" <info@sevenunique.com>`,
      to: process.env.RECEIVER_EMAIL,
      subject: "BC Agent Excel Data",
      html: `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
      <p>Hi Team,</p>

      <p>
        Please find the attached data for the 
        <strong>AEPS</strong> and <strong>MATM</strong> services required for the onboarding process.
      </p>

      <p>
        If you require any further information, please feel free to reach out.
      </p>

      <br/>

      <p>
        Thanks & Regards,<br/>
        <strong>Seven Tech Solutions Pvt. Ltd.</strong>
      </p>
    </div>
  `,
      attachments: [
        {
          filename: `bc-agent-${Date.now()}.xlsx`,
          content: buffer,
        },
      ],
    });
    await userModel.updateOne(
      { _id: userId },
      {
        $set: {
          isOnBoardEmailSend: true,
        },
      }
    );

    return res.json({
      success: true,
      message: "Onboarding mail sent successfully Thank You!",
    });
  } catch (error) {
    console.error("SECURE SMTP ERROR:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error while sending email",
    });
  }
};

exports.updateIsOnBoardStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can update onboarding status",
      });
    }

    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { isOnBoard } = req.body;

    if (typeof isOnBoard !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isOnBoard must be a boolean (true/false)",
      });
    }

    const user = await userModel.findById(userId).select("_id isOnBoard");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isOnBoard === isOnBoard) {
      return res.status(400).json({
        success: false,
        message: `User is already ${isOnBoard ? "onboarded" : "not onboarded"}`,
      });
    }

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            isOnBoard,
          },
        },
        { new: true }
      )
      .select("_id name email isOnBoard");

    return res.status(200).json({
      success: true,
      message: `User successfully ${isOnBoard ? "onboarded" : "deactivated from onboarding"
        }`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("ERROR in updateIsOnBoardStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating onboarding status",
    });
  }
};
