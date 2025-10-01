const User = require("../models/userModel.js");
const mongoose = require("mongoose");
const axios = require("axios");
const PayOut = require("../models/payOutModel.js");
const { parse } = require("json2csv");

exports.getPayOuts = async (req, res, next) => {
  try {
    const {
      keyword,
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
      exportCsv = "false",
      mode,
    } = req.query;
    console.log(req.query);

    const match = {};
    const userId = req.user.role == "Admin" ? req.query.userId : req.user?.id;

    if (keyword) {
      match.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { mobile: { $regex: keyword, $options: "i" } },
        { amount: parseInt(keyword) || 0 },
        { utr: { $regex: keyword, $options: "i" } },
        { reference: { $regex: keyword, $options: "i" } },
      ];
    }
    if (userId) match.user_id = new mongoose.Types.ObjectId(userId);
    if (mode) match.trans_mode = mode;
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
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: "$user.name",
          userEmail: "$user.email",
          name: 1,
          email: 1,
          mobile: 1,
          amount: 1,
          afterAmount: 1,
          charges: 1,
          reference: 1,
          trans_mode: 1,
          account: 1,
          ifsc: 1,
          utr: 1,
          status: 1,
          remark: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    if (exportCsv !== "true") {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) }
      );
    }

    const payOuts = await PayOut.aggregate(pipeline);

    if (exportCsv === "true") {
      const fields = [
        "_id",
        "userId",
        "userName",
        "userEmail",
        "name",
        "email",
        "mobile",
        "amount",
        "afterAmount",
        "charges",
        "reference",
        "trans_mode",
        "account",
        "ifsc",
        "utr",
        "status",
        "remark",
        "createdAt",
      ];
      const csv = parse(payOuts, { fields });
      res.header("Content-Type", "text/csv");
      res.header("Content-Disposition", "attachment; filename=payouts.csv");
      return res.send(csv);
    }

    const totalPipeline = [{ $match: match }, { $count: "total" }];
    const totalResult = await PayOut.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    const result = await PayOut.aggregate([
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const statusSummary = result.reduce((acc, curr) => {
      acc[curr._id] = {
        totalAmount: curr.totalAmount,
        count: curr.count,
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: payOuts,
      statusSummary,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.generatePayOut = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      amount,
      reference,
      account,
      trans_mode,
      ifsc,
      name,
      mobile,
      email,
    } = req.body;

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        $expr: {
          $gte: [{ $subtract: ["$eWallet", "$cappingMoney"] }, amount],
        },
      },
      {
        $inc: { eWallet: -amount },
      },
      {
        session,
        new: true,
      }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance or another transaction in progress.",
      });
    }
    let payoutResponse;
    try {
      payoutResponse = await axios.post(
        "https://api.worldpayme.com/api/v1.1/payoutTransaction",
        {
          amount,
          reference,
          trans_mode,
          account,
          ifsc,
          name,
          mobile,
          email,
          address: updatedUser.address || "",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer YOUR_LONG_LIVED_ACCESS_TOKEN`,
          },
        }
      );
    } catch (externalError) {
      await session.abortTransaction();
      session.endSession();
      return res.status(502).json({
        success: false,
        message: "Payout service unavailable.",
        error: externalError.message,
      });
    }

    if (payoutResponse.status !== 200) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Failed to process payout via provider.",
      });
    }

    const newPayOut = new PayOut({
      userId,
      amount,
      reference,
      account,
      trans_mode: trans_mode || "IMPS",
      ifsc,
      name,
      mobile,
      email,
    });

    await newPayOut.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Payout processed successfully.",
      data: {
        payoutId: newPayOut._id,
        amount,
        reference,
        status: "success",
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.callbackPayout = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;

    const payout = await PayOut.findOne({ reference: data.reference }).session(
      session
    );
    if (!payout || payout.status != "Pending") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Transaction not found or already proceed" });
    }
    if (data.status === "Success") {
      payout.status = "Success";
      payout.reference = data.txn_id;
      payout.utr = data.utr;
      await payout.save({ session });

      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({ message: "Payout successful" });
    }

    payout.status = "Failed";
    await payout.save({ session });

    const user = await User.findById(payout.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    user.eWallet += payout.amount;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      message: "Ok",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: "Something went wrong" });
  }
};

exports.getPayoutStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    const payout = await PayOut.findOne({ reference });

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: "Payout not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        reference: payout.reference,
        status: payout.status,
        amount: payout.amount,
        userId: payout.userId,
        txn_id: payout.txn_id,
        createdAt: payout.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching payout status:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
