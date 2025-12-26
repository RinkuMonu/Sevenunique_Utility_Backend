const { default: axios } = require("axios");
const CryptoJS = require("crypto-js");
require("dotenv").config();
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");
const path = require("path");
const userModel = require("../models/userModel");
const mongoose = require("mongoose");
const {
  getApplicableServiceCharge,
  calculateCommissionFromSlabs,
  logApiCall,
} = require("../utils/chargeCaluate");
const AEPSTransaction = require("../models/aepsModels/withdrawalEntry");
const Transaction = require("../models/transactionModel");
const { distributeCommission } = require("../utils/distributerCommission");
const matmModel = require("../models/matm.model");
const onboardSendEmail = require("../models/onboardSendEmail");
const CommissionTransaction = require("../models/CommissionTransaction");

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
      clientRefID,
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
      AUTH_DECLINE: "Failed",
    };

    const finalStatus = statusMap[status] || "Pending";

    const user = await userModel.findOne({ UserId: username }).session(session);
    if (!user) throw new Error("User not found");

    let category = null;

    // Category mapping
    if (txnType === "AEPS_CASH_WITHDRAWAL") {
      category = "68c9369d8fa1dda33eb541b6";
    } else {
      category = "6918314027e9c0be214ff15d";
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

    const { commissions, service } = await getApplicableServiceCharge(
      user._id,
      category
    );

    if (txnType === "AEPS_CASH_WITHDRAWAL" || txnType === "AEPS_CASH_DEPOSIT") {
      commission = commissions
        ? calculateCommissionFromSlabs(txnAmount, commissions)
        : commission;
    }
    if (txnType === "AEPS_CASH_WITHDRAWAL") {
      required =
        Number(txnAmount) -
        Number(commission.charge) -
        Number(commission.tds) -
        Number(commission.gst) +
        Number(commission.retailer);
    }
    if (txnType === "AEPS_CASH_DEPOSIT") {
      required =
        Number(txnAmount) +
        Number(commission.charge) +
        Number(commission.tds) +
        Number(commission.gst) -
        Number(commission.retailer);
    }

    if (
      txnType === "AEPS_MINI_STATEMENT" ||
      txnType === "AEPS_BALANCE_ENQUIRY"
    ) {
      const rewardAmount =
        Number(
          txnType === "AEPS_MINI_STATEMENT"
            ? commissions?.aepsMiniStatement
            : commissions?.aepsBalanceEnquiry
        ) || 0;

      if (Number(rewardAmount) > 0) {
        let updatedUser = user;
        // Wallet reward credit
        if (status === "SUCCESS") {
          updatedUser = await userModel.findOneAndUpdate(
            { UserId: username },
            { $inc: { eWallet: +Number(rewardAmount) } },
            { new: true, session }
          );
        }

        // Create reward transaction
        await Transaction.create(
          [
            {
              user_id: user._id,
              transaction_type: "credit",
              type: service._id,
              amount: 0,
              totalCredit: rewardAmount,
              balance_after: updatedUser.eWallet,
              description: `${txnType} Reward`,
              status: finalStatus,
              transaction_reference_id: clientRefID,
            },
          ],
          { session }
        );

        await AEPSTransaction.create(
          [
            {
              userId: user._id,
              balance_after: updatedUser.eWallet,
              type: finalType,
              mobilenumber: user.mobileNumber,
              adhaarnumber: customeridentIfication,
              amount: 0,
              clientrefno: clientRefID,
              bankrrn: rrn,
              status: finalStatus,
              charges: commission.charge,
              gst: commission.gst,
              tds: commission.tds,
              retailerCommission: commission.retailer,
              distributorCommission: commission.distributor,
              adminCommission: commission.admin,
              apiResponse: req.body,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();
      return res.status(200).json({
        status: true,
        message: `${txnType} processed`,
        rewardGiven: Number(rewardAmount) > 0 ? rewardAmount : 0,
      });
    }

    if (status !== "SUCCESS") {
      await Transaction.create(
        [
          {
            user_id: user._id,
            transaction_type:
              txnType === "AEPS_CASH_DEPOSIT" ? "debit" : "credit",
            type: service._id,
            amount: txnAmount,
            gst: commission.gst,
            tds: commission.tds,
            charge: commission.charge,
            totalDebit: 0,
            totalCredit: 0,
            balance_after: user.eWallet,
            payment_mode: "wallet",
            status: finalStatus,
            description: `AEPS ${txnType} Failed`,
            transaction_reference_id: clientRefID,
          },
        ],
        { session }
      );

      await AEPSTransaction.create(
        [
          {
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
            apiResponse: req.body,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return res.status(200).json({
        status: false,
        message: `${txnType} Failed`,
      });
    }

    let updatedUser = user;
    if (txnType === "AEPS_CASH_WITHDRAWAL") {
      updatedUser = await userModel.findOneAndUpdate(
        { UserId: username },
        { $inc: { eWallet: +Number(required) } },
        { new: true, session }
      );
    }

    if (txnType === "AEPS_CASH_DEPOSIT") {
      updatedUser = await userModel.findOneAndUpdate(
        { UserId: username },
        { $inc: { eWallet: -Number(required) } },
        { new: true, session }
      );
    }

    // Transaction Entry
    await Transaction.create(
      [
        {
          user_id: user._id,
          transaction_type:
            txnType === "AEPS_CASH_DEPOSIT" ? "debit" : "credit",
          type: service._id,
          amount: txnAmount,
          totalCredit:
            txnType === "AEPS_CASH_DEPOSIT"
              ? Number(commission.retailer || 0)
              : Number(required || 0),
          totalDebit:
            txnType === "AEPS_CASH_DEPOSIT"
              ? Number(required)
              : Number(commission.charge || 0) +
              Number(commission.gst || 0) +
              Number(commission.tds || 0),
          charge: commission.charge,
          balance_after: updatedUser.eWallet,
          gst: commission.gst,
          tds: commission.tds,
          transaction_reference_id: clientRefID,
          description: `AEPS ${txnType}`,
          status: finalStatus,
        },
      ],
      { session }
    );

    await AEPSTransaction.create(
      [
        {
          userId: user._id,
          balance_after: updatedUser.eWallet,
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
          apiResponse: req.body,
        },
      ],
      { session }
    );

    if (txnType === "AEPS_CASH_WITHDRAWAL" || txnType === "AEPS_CASH_DEPOSIT") {
      await distributeCommission({
        user: user._id,
        distributer: user.distributorId,
        service,
        transferAmount: txnAmount,
        commission,
        reference: clientRefID,
        description: "AEPS Commission",
        session,
      });

      await CommissionTransaction.create([{
        referenceId: clientRefID,
        service: service._id,
        baseAmount: txnAmount,
        charge: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
        netAmount: required,
        roles: [
          { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0 },
          { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
          { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
        ],
        type: "credit",
        status: "Success",
        sourceRetailerId: user._id
      }], { session });


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
  logApiCall({
    url: "/m-atmCallback",
    requestData: {},
    responseData: req.body,
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("mATM Callback Data:", req.body);
    const data = req.body;

    // USER FIND
    const user = await userModel
      .findOne({
        UserId: data.username,
      })
      .session(session);

    if (!user) throw new Error("User not found for this Outlet ID");

    const userId = user._id;
    const txnAmount = Number(data.txnAmount || 0);

    // 🔹 STATUS MAPPING
    const statusMap = {
      AUTH_SUCCESS: "Success",
      SUCCESS: "Success",
      FAILED: "Failed",
      AUTH_FAILED: "Failed",
      AUTH_DECLINE: "Failed",
    };
    const finalStatus = statusMap[data.status] || "Pending";

    // 🔹 TYPE MAPPING
    const txnTypeMap = {
      mATM_BALANCE_ENQUIRY: "BalanceEnquiry",
      mATM_CASH_WITHDRAWAL: "Withdrawal",
    };
    const finalType = txnTypeMap[data.txnType] || "Unknown";

    const categoryId = "6918432258971284f348b5c8";

    if (data.txnType === "mATM_BALANCE_ENQUIRY") {
      await matmModel.create(
        [
          {
            userId,
            txnType: finalType,
            productCode: data.productCode,
            amount: 0,
            charge: 0,
            tds: 0,
            gst: 0,
            mobile: data.mobile_number,
            rrn: data.rrn,
            customeridentIfication: data.customeridentIfication,
            clientRefID: data.clientRefID,
            txnId: data.txnId,
            status: finalStatus,
            balance_after: user.eWallet,
            description: data.statusDesc || "mATM Balance Enquiry",
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return res.json({ status: 1, message: "Balance Enquiry Saved" });
    }

    const { commissions, service } = await getApplicableServiceCharge(
      userId,
      categoryId
    );

    const commission = commissions
      ? calculateCommissionFromSlabs(txnAmount, commissions)
      : {
        retailer: 0,
        distributor: 0,
        admin: 0,
        charge: 0,
        gst: 0,
        tds: 0,
      };

    if (finalStatus !== "Success") {
      await matmModel.create(
        [
          {
            userId,
            txnType: finalType,
            productCode: data.productCode,
            amount: txnAmount,
            charge: commission.charge,
            gst: commission.gst,
            tds: commission.tds,
            mobile: data.mobile_number,
            rrn: data.rrn,
            customeridentIfication: data.customeridentIfication,
            clientRefID: data.clientRefID,
            txnId: data.txnId,
            status: finalStatus,
            balance_after: user.eWallet,
            description: data.statusDesc || "mATM Cash Withdrawal Failed",
            retailerCommission: commission.retailer,
            distributorCommission: commission.distributor,
            adminCommission: commission.admin,
          },
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            user_id: userId,
            transaction_type: "credit",
            type: service?._id,
            amount: txnAmount,
            totalCredit: 0,
            balance_after: user.eWallet,
            charge: commission.charge,
            gst: commission.gst,
            tds: commission.tds,
            description: data.statusDesc || "mATM Cash Withdrawal Failed",
            transaction_reference_id: data.clientRefID,
            status: finalStatus,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return res.json({ status: 0, message: "Transaction Failed" });
    }

    const required = Number(
      (
        Number(data.txnAmount) -
        Number(commission.charge || 0) -
        Number(commission.gst || 0) -
        Number(commission.tds || 0) +
        Number(commission.retailer || 0)
      ).toFixed(2)
    );

    const updatedUser = await userModel.findOneAndUpdate(
      { UserId: data.username },
      { $inc: { eWallet: required } },
      { new: true, session }
    );

    await Transaction.create(
      [
        {
          user_id: userId,
          transaction_type: "credit",
          type: service?._id,
          amount: txnAmount,
          totalCredit: required,
          balance_after: updatedUser.eWallet,
          charge: commission.charge,
          gst: commission.gst,
          tds: commission.tds,
          description: data.statusDesc || "mATM Cash Withdrawal Commission",
          transaction_reference_id: data.clientRefID,
          status: finalStatus,
        },
      ],
      { session }
    );

    await matmModel.create({
      userId,
      txnType: finalType,
      productCode: data.productCode,
      mobile: data.mobile_number,
      amount: txnAmount,
      charge: commission.charge,
      txnId: data.txnId,
      gst: commission.gst,
      tds: commission.tds,
      rrn: data.rrn,
      customeridentIfication: data.customeridentIfication,
      clientRefID: data.clientRefID,
      status: finalStatus,
      balance_after: updatedUser.eWallet,
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
      session,
    });

    await CommissionTransaction.create([{
      referenceId: data.clientRefID,
      service: service._id,
      baseAmount: txnAmount,
      charge: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
      netAmount: required,
      roles: [
        { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0 },
        { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
        { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
      ],
      type: "credit",
      status: "Success",
      sourceRetailerId: userId
    }], { session });

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
    const {
      page = 1,
      limit = 20,
      search = "",
      status,
      txnType,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    const skip = (page - 1) * limit;

    const userId = req.user.id;
    const loggedInUser = await userModel.findById(userId);
    if (!loggedInUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (loggedInUser.role === "Retailer") {
      query.userId = loggedInUser._id;
    } else if (loggedInUser.role === "Distributor") {
      const retailers = await userModel.find(
        { distributorId: loggedInUser._id },
        "_id"
      );

      const retailerIds = retailers.map((r) => r._id);

      if (retailerIds.length === 0) {
        return res.json({
          status: true,
          page: Number(page),
          limit: Number(limit),
          total: 0,
          data: [],
        });
      }

      query.userId = { $in: retailerIds };
    }

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

    // Date Filter
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const [data, total] = await Promise.all([
      matmModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      matmModel.countDocuments(query),
    ]);

    return res.json({
      status: true,
      page: Number(page),
      limit: Number(limit),
      total,
      data,
    });
  } catch (err) {
    console.error("Error in getMatmReports:", err);
    res.status(500).json({ status: false, message: err.message });
  }
};

// Excel Mapping Function
exports.getOnboardingList = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      status = "all",
      from,
      to,
      sort = "desc",
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const match = {};

    // STATUS FILTER
    if (status === "pending") match.mailSent = false;
    if (status === "sent") match.mailSent = true;

    // DATE FILTER
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    // SEARCH FILTER (name, mobile, email, bcagentid)
    if (search.trim() !== "") {
      match.$or = [
        { "formData.bcagentname": { $regex: search, $options: "i" } },
        { "formData.lastname": { $regex: search, $options: "i" } },
        { "formData.email": { $regex: search, $options: "i" } },
        { "formData.bcagentid": { $regex: search, $options: "i" } },
      ];
    }

    // SORT ORDER
    const sortOption = sort === "asc" ? 1 : -1;

    // TOTAL COUNT FOR PAGINATION
    const total = await onboardSendEmail.countDocuments(match);

    // MAIN DATA FETCH
    const data = await onboardSendEmail
      .find(match)
      .populate("userId", "name email mobile isOnBoard")
      .sort({ createdAt: sortOption })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data,
    });
  } catch (err) {
    console.error("GET ONBOARDING LIST ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.storeOnboardingData = async (req, res) => {
  try {
    const { formData } = req.body;
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }
    const user = await userModel.findById(userId).select("isOnBoardEmailSend isVideoKyc");
    if (!user.isVideoKyc) {
      return res.status(400).json({
        success: false,
        message: "First you must complete your video KYC",
      });
    }

    if (user?.isOnBoardEmailSend === true) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted onboarding request. Please wait.",
      });
    }

    if (!formData || typeof formData !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing form data",
      });
    }

    const saved = await onboardSendEmail.create({
      userId,
      formData,
      mailSent: false,
      batchId: null,
      mailSentAt: null,
    });
    await userModel.updateOne(
      { _id: userId },
      { $set: { isOnBoardEmailSend: true } }
    );
    return res.json({
      success: true,
      message: "Onboarding Request sent successfully",
      data: saved,
    });
  } catch (error) {
    console.error("STORE ONBOARD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server busy try after some time",
    });
  }
};

exports.sendBatchOnboardingMail = async (req, res, forceSend = false) => {
  const isApiCall = !!res;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const pendingUsers = await onboardSendEmail
      .find({ mailSent: false })
      .sort({ createdAt: 1 });

    if (!pendingUsers.length) {
      console.log("No pending onboarding records.");
      const response = {
        success: false,
        message: "No pending onboarding records",
      };

      return isApiCall ? res.status(400).json(response) : response;
    }

    if (!forceSend && pendingUsers.length < 5) {
      console.log(`Waiting… only ${pendingUsers.length}/5 users available.`);

      const response = {
        success: false,
        message: "Less than 5 users in queue",
      };

      return isApiCall ? res.status(400).json(response) : response;
    }

    const usersToSend = forceSend ? pendingUsers : pendingUsers.slice(0, 5);
    const batchId = "BATCH-" + Date.now();

    // EXCEL
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("BC Agent Data");

    sheet.columns = [
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

    usersToSend.forEach((r) => sheet.addRow(r.formData));

    const buffer = await workbook.xlsx.writeBuffer();

    // MAIL SEND
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"SevenUnique" <info@7unique.in>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `Onboarding Batch - ${usersToSend.length} Users`,
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
      attachments: [{ filename: `batch-${batchId}.xlsx`, content: buffer }],
    });

    if (!info.messageId) {
      await session.abortTransaction();
      const response = {
        success: false,
        message: "issue while sending onboarding mail",
      };
      return isApiCall ? res.status(400).json(response) : response;
    }

    await onboardSendEmail.updateMany(
      { _id: { $in: usersToSend.map((u) => u._id) } },
      { $set: { mailSent: true, batchId, mailSentAt: new Date() } },
      { session }
    );

    await session.commitTransaction();

    const response = {
      success: true,
      message: `${usersToSend.length} users mail sent successfully`,
      count: usersToSend.length,
      batchId,
    };

    return isApiCall ? res.status(200).json(response) : response;
  } catch (err) {
    console.error("Batch Error:", err);
    await session.abortTransaction();

    const response = { success: false, message: err.message };

    return isApiCall ? res.status(400).json(response) : response;
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

exports.updateOnboardMailStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { mailSent } = req.body;

    if (typeof mailSent !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "mailSent must be true or false",
      });
    }

    const updateData = {
      mailSent,
      mailSentAt: mailSent ? new Date() : null,
      batchId: mailSent ? "ADMIN-MANUAL-" + Date.now() : null,
    };

    const updated = await onboardSendEmail.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    return res.json({
      success: true,
      message: "Mail status updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update Mail Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


exports.checkIserveuTxnStatus = async (req, res) => {
  try {
    const { transactionDate, clientRefId } = req.body;

    // ✅ Basic validation
    if (!transactionDate || !clientRefId) {
      return res.status(400).json({
        success: false,
        message: "transactionDate and clientRefId are required",
      });
    }

    // transactionDate must be YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(transactionDate)) {
      return res.status(400).json({
        success: false,
        message: "transactionDate must be in YYYY-MM-DD format",
      });
    }

    // ✅ Build request payload (as per IServeU spec)
    const payload = {
      "$1": "UAeps_txn_status_api",
      "$4": transactionDate,
      "$5": transactionDate, // must be same as start date
      "$6": clientRefId,
    };

    const response = await axios.post(
      "https://apidev.iserveu.online/sandbox/statuscheck/txnreport",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          client_id: process.env.ISERVEU_CLIENT_ID,
          client_secret: process.env.ISERVEU_CLIENT_SECRET,
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    // ✅ SUCCESS with data
    if (data.status === 200 && data.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Transaction status fetched",
        data: data.results[0], // usually single record
      });
    }

    // ✅ SUCCESS but NO DATA
    if (data.status === 1 && data.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No record found for given transaction",
        data: null,
      });
    }

    // ❌ FAILED response
    return res.status(400).json({
      success: false,
      message: data.message || "Transaction status query failed",
      data,
    });

  } catch (error) {
    console.error("IServeU Status API Error:", error?.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction status",
      error: error?.response?.data || error.message,
    });
  }
};
