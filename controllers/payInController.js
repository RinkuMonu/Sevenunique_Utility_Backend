const User = require("../models/userModel.js");
const mongoose = require("mongoose");
const PayIn = require("../models/payInModel.js");
const axios = require("axios");
const { parse } = require("json2csv");
const Transaction = require("../models/transactionModel.js");
const payInModel = require("../models/payInModel.js");
const servicesModal = require("../models/servicesModal.js");


exports.allPayin = async (req, res, next) => {
  try {
    const {
      keyword,
      status,
      fromDate,
      toDate,
      searchText,
      page = 1,
      limit = 10,
      exportCsv = "false",
    } = req.query;

    const match = {};
    const userId = req.user.role == "Admin" ? req.query.userId : req.user?.id;
    if (userId) match.userId = new mongoose.Types.ObjectId(userId);
    if (status) match.status = status;
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) match.createdAt.$lte = new Date(toDate);
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (searchText) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchText, $options: "i" } },
            { email: { $regex: searchText, $options: "i" } },
            { mobile: parseInt(searchText) || -1 },
            { amount: parseInt(searchText) || -1 },
            { utr: { $regex: searchText, $options: "i" } },
            { reference: { $regex: searchText, $options: "i" } },
            { "user.UserId": { $regex: searchText, $options: "i" } },
            { "user.name": { $regex: searchText, $options: "i" } },
            { "user.email": { $regex: searchText, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: "$user.name",
          userEmail: "$user.email",
          UserId: "$user.UserId",
          name: 1,
          email: 1,
          mobile: 1,
          amount: 1,
          afterAmount: 1,
          charges: 1,
          reference: 1,
          utr: 1,
          status: 1,
          remark: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } }
    );

    if (exportCsv !== "true") {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) }
      );
    }

    const payIns = await PayIn.aggregate(pipeline);

    if (exportCsv === "true") {
      const fields = [
        "_id",
        "userId",
        "userName",
        "userEmail",
        "userUniqueId",
        "name",
        "email",
        "mobile",
        "amount",
        "afterAmount",
        "charges",
        "reference",
        "utr",
        "status",
        "remark",
        "createdAt",
      ];
      const csv = parse(payIns, { fields });
      res.header("Content-Type", "text/csv");
      res.header("Content-Disposition", "attachment; filename=payins.csv");
      return res.send(csv);
    }

    // total count ke liye
    const totalPipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];
    if (searchText) {
      totalPipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchText, $options: "i" } },
            { email: { $regex: searchText, $options: "i" } },
            { mobile: parseInt(searchText) || -1 },
            { amount: parseInt(searchText) || -1 },
            { utr: { $regex: searchText, $options: "i" } },
            { reference: { $regex: searchText, $options: "i" } },
            { "user.UserId": { $regex: searchText, $options: "i" } },
            { "user.name": { $regex: searchText, $options: "i" } },
            { "user.email": { $regex: searchText, $options: "i" } },
          ],
        },
      });
    }
    totalPipeline.push({ $count: "total" });

    const totalResult = await PayIn.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      data: payIns,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.createPayIn = async (req, res, next) => {
  try {
    const {
      userId,
      amount,
      reference,
      name,
      mobile,
      email,
      utr,
      remark,
      charges,
    } = req.body;

    if (!userId || amount == null || !reference || !name || !mobile || !email) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const payIn = await PayIn.create({
      userId,
      amount,
      reference,
      name,
      mobile,
      email,
      utr,
      remark,
      charges,
      status: "Pending",
      adminAction: "Pending",
    });

    res.status(201).json({ success: true, data: payIn });
  } catch (error) {
    next(error);
  }
};

exports.generatePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tokenResponse = await axios.post(
      "https://admin.finuniques.in/api/v1.1/t1/oauth/token",
      
      new URLSearchParams({
        authKey: "UTI6tamscw",
        authSecret: "4jtudpz0ri1x2t@y",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const accessToken = tokenResponse?.data?.data?.access_token;

    if (!accessToken) {
      return res
        .status(400)
        .json({ success: false, message: "Failed to fetch token" });
    }
    const { userId, amount, category, reference, name, mobile, email } = req.body;

    if (!amount || !reference || !name || !mobile || !email) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const user = await User.findOne({
      _id: req?.user?.id || userId,
      status: true,
    }).session(session);

    const service = await servicesModal.findOne({ _id: category });
    if (!service) {
      return res.status(400).json({ success: false, message: "Service not found" });
    }

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "User not found or inactive" });
    }

    const referenceId = `PAY${Date.now()}`;

    const [transaction] = await Transaction.create(
      [
        {
          user_id: user._id,
          transaction_type: "credit",
          amount: Number(amount),
          type: service._id,
          balance_after: user.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: referenceId,
          description: `PayIn initiated for ${user.name}`,
          status: "Pending",
        },
      ],
      { session }
    );

    const [payIn] = await PayIn.create(
      [
        {
          userId: user._id,
          fromUser: user._id,
          mobile: user.mobileNumber,
          email: user.email,
          reference: referenceId,
          name: user.name,
          source: "PayIn",
          amount: Number(amount),
          type: service._id,
          charges: 0,
          remark: "Payment Pending",
          status: "Pending",
        },
      ],
      { session }
    );


    let response;
    try {
      response = await axios.post(
        "https://admin.finuniques.in/api/v1.1/t1/UpiIntent",
        { amount, reference, name, email, mobile },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      console.log(response);

    } catch (apiError) {

      response = { status: 500, data: { success: false, message: apiError.response.data.message } };
    }

    // 🔹 Check API response and decide outcome
    if (response.status !== 200 || !response.data?.success == 'success') {
      // ❌ Mark as Failed and save before exiting
      payIn.status = "Failed";
      transaction.status = "Failed";
      payIn.remark = response.data?.message || "UPI Intent creation failed";
      transaction.description = response.data?.message || "UPI Intent creation failed";

      await payIn.save({ session });
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: payIn.remark,
      });
    }

    // ✅ Success flow
    payIn.status = "Success";
    transaction.status = "Success";
    payIn.remark = response.data?.message || "Payment Successfully add!";
    transaction.description = response.data?.message || "Payment Successfully add!";
    user.eWallet = Number(user.eWallet) + Number(amount);

    await user.save({ session });
    await payIn.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "PayIn successful and wallet updated",
      data: {
        paymentIntent: response.data,
        updatedBalance: user.eWallet,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PayIn Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while processing payment",
    });
  }
};

exports.callbackPayIn = async (req, res) => {
  try {
    const data = req.body;
    console.log("🔔 Callback data received:", data);

    // Step 1: Find PayIn with status "Pending"
    const payin = await PayIn.findOneAndUpdate(
      { reference: data.reference, status: "Pending" }, // only Pending allowed
      {
        $set: {
          status: data.status === "Success" ? "Success" : "Failed",
          utr: data.utr || null,
          remark:
            data.status === "Success"
              ? "Payment successful"
              : data.error || data.message || "Payment failed",
        },
      },
      { new: true } // return updated document
    );

    // If PayIn not found or already processed
    if (!payin) {
      console.log(
        "⚠️ Callback ignored (already processed or invalid reference):",
        data.reference
      );
      return res.status(200).json({
        message: "Transaction already processed or not found",
      });
    }

    console.log("📄 PayIn record updated:", {
      reference: payin.reference,
      finalStatus: payin.status,
      dbAmount: payin.amount,
      gatewayAmount: data.amount,
    });

    // Step 2: If Success → Increment wallet balance atomically
    if (payin.status === "Success") {
      const user = await User.findOneAndUpdate(
        { _id: payin.userId, status: true },
        { $inc: { eWallet: payin.amount } }, // always trust DB amount
        { new: true }
      );

      if (!user) {
        console.warn("❌ User not found or inactive:", payin.userId);
        return res.status(404).json({ message: "User not found or inactive" });
      }

      console.log("💰 Wallet updated successfully:", {
        added: payin.amount,
        newBalance: user.eWallet,
      });
    }

    console.log("🎯 Callback processed successfully for:", data.reference);

    return res.status(200).json({
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("🔥 Error in callback handler:", error.message, error.stack);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

exports.checkPayInStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Reference ID is required" });
    }

    const payin = await PayIn.findOne(
      { reference },
      {
        _id: 0,
        reference: 1,
        status: 1,
        utr: 1,
        amount: 1,
        remark: 1,
        createdAt: 1,
      }
    );

    if (!payin) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...payin.toObject(),
        timestamp: payin.createdAt,
      },
    });
  } catch (error) {
    console.error("Error checking PayIn status:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
