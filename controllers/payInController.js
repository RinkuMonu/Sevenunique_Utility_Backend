const User = require("../models/userModel.js");
const mongoose = require("mongoose");
const PayIn = require("../models/payInModel.js"); // Renamed to match model convention
const axios = require("axios");
const { parse } = require('json2csv');


exports.allPayin = async (req, res, next) => {
  try {
    const {
      keyword,
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
      exportCsv = 'false'
    } = req.query;

    const match = {};

    const userId = req.user.role == "Admin" ? req.query.userId : req.user?.id;

    if (keyword) {
      match.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } },
        { mobile: parseInt(keyword) || 0 }, // Try to match mobile as number
        { reference: { $regex: keyword, $options: 'i' } }
      ];
    }
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
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: '$user.name',
          userEmail: '$user.email',
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
          createdAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ];

    if (exportCsv !== 'true') {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) }
      );
    }

    const payIns = await PayIn.aggregate(pipeline);

    if (exportCsv === 'true') {
      const fields = [
        '_id',
        'userId',
        'userName',
        'userEmail',
        'name',
        'email',
        'mobile',
        'amount',
        'afterAmount',
        'charges',
        'reference',
        'utr',
        'status',
        'remark',
        'createdAt'
      ];
      const csv = parse(payIns, { fields });
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename=payins.csv');
      return res.send(csv);
    }

    const totalPipeline = [{ $match: match }, { $count: 'total' }];
    const totalResult = await PayIn.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      data: payIns,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) { return next(error) }
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
      charges
    } = req.body;

    if (!userId || amount == null || !reference || !name || !mobile || !email) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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
      status: 'Pending',
      adminAction: 'Pending'
    });

    res.status(201).json({ success: true, data: payIn });
  } catch (error) {
    next(error);
  }
};

exports.generatePayment = async (req, res, next) => {
  const { userId, amount, reference, name, mobile, email } = req.body;

  if (!amount || !reference || !name || !mobile || !email) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const user = await User.findOne({ _id: req?.user?.id || userId, status: true })
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found or not active" });
  }

  try {
    const response = await axios.post(
      "https://api.worldpayme.com/api/v1.1/createUpiIntent ",
      {
        amount,
        reference,
        name,
        email,
        mobile,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:`Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI4IiwianRpIjoiMTdiODhhYmZjMTNhMDZmYzcxMzMzZjVkMmYzMTE0YzM3OTc1ZmE2OWY1ZWZlMjViZmQ2YjE2M2ZhOTNmOTZiZjJkMDQxYmFjZWEwZTU5MTEiLCJpYXQiOjE3NDQ5NTU3ODEuMzkwMDA4LCJuYmYiOjE3NDQ5NTU3ODEuMzkwMDEsImV4cCI6MTc3NjQ5MTc4MS4zODc2MTUsInN1YiI6IjI1NiIsInNjb3BlcyI6W119.S9FPsBiod-TXlWf-t2zB0DegZ7EZrzpP1g-YaiIA6oTNayIANqDTVzmFy7llw3jyGF4uOzC8nqstuNJ727amo0qVtgC4rb1C-Sfek4RUUUstjKl5hnSHZe63cH0ss5TZ5K_QrXouHNtibggzJ6PECIEA4Q_9WMmoPWK3pe06wNUk94OctGxgDtvzqDGB-CQK9bfpdPTiUWA_b7EyN6rQ6JUYcKDN1Crw8snH3gdKz5dT91KHhQd6SzCueHcPMJpc2HbgNfxn_WqBWB7VUMURRaLW4o4Yj-fTpkiBrgyoR1i0f-Kq0E5H-YEUHTzZTaOVzkbucd2gg9kX2qo_LeVFidFJsJrJ-qOQuwUYlVpAOOO_T-oILchC-TNOqHALeUfxtNYXlsps7SsCW4qrOLr6CEPm2deojgXO5B_VEUSfHrff9VWLmIOqX5V1VFr7qocoVxq8QEuHFCXDbaes7YwxLayactAhPKwPlkmQopr9syYS9swsHWgwtQET0vLI-RD78Cg59Z9AqVOZB1df_J4ZjXBOzURCoFGqs5YgsDFZD2hhTWVoynBKa5D694wBrOyr2U1hEOgW90pjx5_6VRmPGyP60hHeZDuBUPdzioh5M-LL5Ivhy076jVEeuGi3U8VlCSxU2iOqRqaOUOMASKqevVHPoxznqhCtMXlQa3V31v4`,
      },
        },
      
    );


    if (response.status !== 200) {
      throw new Error("Failed to create payment intent");
    }

    const newPayIn = new PayIn({
      userId: user._id,
      amount,
      reference,
      name,
      mobile,
      email,
    });

    await newPayIn.save();

    return res.status(200).json(response.data);
  } catch (error) {
    next(error);
  }
};

exports.callbackPayIn = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const data = req.body;

    const payin = await PayIn.findOne({ reference: data.reference }).session(session);
    if (!payin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (payin.status === "Success" || payin.status === "Failed") {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: "Transaction already processed" });
    }

    const user = await User.findOne({ _id: payin.userId, status: true }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found or inactive" });
    }

    if (data.status === "Success") {
      payin.status = "Success";
      payin.utr = data.utr;
      payin.remark = "Payment successful";
      await payin.save({ session });

      user.eWallet += payin.amount;
      await user.save({ session });

    } else {
      payin.status = "Failed";
      payin.remark = data.error || "Payment failed";
      await payin.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("Error in callback handler:", error.message);
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.checkPayInStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ success: false, message: "Reference ID is required" });
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
      return res.status(404).json({ success: false, message: "Transaction not found" });
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
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
