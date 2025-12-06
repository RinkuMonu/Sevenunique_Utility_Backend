const mongoose = require("mongoose");
const Transaction = require("../models/transactionModel.js");
const User = require("../models/userModel.js");
const { parse } = require("json2csv");
const payInModel = require("../models/payInModel.js");
const payOutModel = require("../models/payOutModel.js");

exports.getWalletTransactions = async (req, res) => {
  try {
    const {
      keyword,
      transaction_type,
      status,
      payment_mode,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
      exportCsv = "false",
    } = req.query;

    const userId = req.user.role == "Admin" ? req.query.userId : req.user?.id;

    const match = {};
    if (userId) match.user_id = new mongoose.Types.ObjectId(userId);
    if (transaction_type) match.transaction_type = transaction_type;
    if (status) match.status = status;
    if (payment_mode) match.payment_mode = payment_mode;
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
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    // 👇 keyword search after lookup (Transaction + User fields)
    if (keyword) {
      const regex = new RegExp(keyword, "i");
      const numVal = parseInt(keyword);

      pipeline.push({
        $match: {
          $or: [
            { description: { $regex: regex } },
            { transaction_reference_id: { $regex: regex } },
            ...(isNaN(numVal) ? [] : [{ amount: numVal }]),

            // 🔑 User model fields
            { "user.UserId": { $regex: regex } },
            { "user.name": { $regex: regex } },
            { "user.email": { $regex: regex } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          user_id: 1,
          userName: "$user.name",
          userEmail: "$user.email",
          UserId: "$user.UserId", // 👈 custom UserId
          transaction_type: 1,
          amount: 1,
          balance_after: 1,
          status: 1,
          payment_mode: 1,
          transaction_reference_id: 1,
          description: 1,
          createdAt: 1,
          gst: 1,
          tds: 1,
          charge: 1,
          totalDebit: 1,
          totalCredit: 1,
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

    const transactions = await Transaction.aggregate(pipeline);

    if (exportCsv === "true") {
      const fields = [
        "_id",
        "user_id",
        "userName",
        "userEmail",
        "UserId",
        "transaction_type",
        "amount",
        "balance_after",
        "status",
        "payment_mode",
        "transaction_reference_id",
        "description",
        "createdAt",
        "gst",
        "tds",
        "charge",
      ];
      const csv = parse(transactions, { fields });
      res.header("Content-Type", "text/csv");
      res.header(
        "Content-Disposition",
        "attachment; filename=transactions.csv"
      );
      return res.send(csv);
    }

    // total count (with same filters)
    const totalPipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];
    if (keyword) {
      const regex = new RegExp(keyword, "i");
      const numVal = parseInt(keyword);
      totalPipeline.push({
        $match: {
          $or: [
            { description: { $regex: regex } },
            { transaction_reference_id: { $regex: regex } },
            ...(isNaN(numVal) ? [] : [{ amount: numVal }]),
            { "user.UserId": { $regex: regex } },
            { "user.name": { $regex: regex } },
            { "user.email": { $regex: regex } },
          ],
        },
      });
    }
    totalPipeline.push({ $count: "total" });

    const totalResult = await Transaction.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

exports.createWalletTransaction = async (req, res) => {
  try {
    const {
      user_id,
      transaction_type,
      amount,
      status = "pending",
      payment_mode,
      transaction_reference_id,
      description,
    } = req.body;

    if (!user_id || !transaction_type || amount == null) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let newBalance = user.eWallet || 0;
    if (transaction_type === "credit") {
      newBalance += amount;
    } else if (transaction_type === "debit") {
      if (newBalance < amount) {
        return res
          .status(400)
          .json({ success: false, message: "Insufficient balance" });
      }
      newBalance -= amount;
    }

    user.eWallet = newBalance;
    await user.save();

    const transaction = await Transaction.create({
      user_id,
      transaction_type,
      amount,
      balance_after: newBalance,
      status,
      payment_mode,
      transaction_reference_id,
      description,
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAdminSummary = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);

    // Total PayIn across all users
    const totalPayInAgg = await payInModel.aggregate([
      {
        $group: {
          _id: null,
          totalPayIn: { $sum: "$amount" },
        },
      },
    ]);

    // Total PayOut across all users
    const totalPayOutAgg = await payOutModel.aggregate([
      {
        $group: {
          _id: null,
          totalPayOut: { $sum: "$amount" },
        },
      },
    ]);

    const totalPayIn = totalPayInAgg[0]?.totalPayIn || 0;
    const totalPayOut = totalPayOutAgg[0]?.totalPayOut || 0;

    const currentBalance = admin.eWallet || 0; // Admin’s own balance

    res.json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        role: admin.role,
        email: admin.email,
        UserId: admin.UserId,
      },
      total: { totalPayIn, totalPayOut, currentBalance },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 2️⃣ Get All Users under Admin (Distributors / Retailers)
exports.getUsersUnderAdmin = async (req, res) => {
  try {
    const { name, role, page = 1, limit = 10 } = req.query;
    let query = {};

    if (req.user.role === "Admin") {
      query = { role: { $in: ["Distributor", "Retailer"] } };
    } else if (req.user.role === "Distributor") {
      query = { role: "Retailer", distributorId: req.user.id };
    } else {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (name) {
      query.$or = [
        { name: { $regex: name, $options: "i" } },
        { UserId: { $regex: name, $options: "i" } },
      ];
    }
    if (role) query.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await User.countDocuments(query);

    const users = await User.find(query)
      .select("name role UserId eWallet distributorId")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const userData = await Promise.all(
      users.map(async (user) => {
        const payInAgg = await payInModel.aggregate([
          { $match: { userId: user._id, status: "Success" } },
          { $group: { _id: null, totalPayIn: { $sum: "$amount" } } },
        ]);

        // Total PayOut
        const payOutAgg = await payOutModel.aggregate([
          { $match: { userId: user._id, status: "Success" } },
          { $group: { _id: null, totalPayOut: { $sum: "$amount" } } },
        ]);

        const totalCredit = payInAgg[0]?.totalPayIn || 0;
        const totalDebit = payOutAgg[0]?.totalPayOut || 0;

        return {
          _id: user._id,
          distributorId: user.distributorId,
          UserId: user.UserId,
          name: user.name,
          role: user.role,
          totalCredit,
          totalDebit,
          currentBalance: user.eWallet || 0,
        };
      })
    );

    res.json({
      success: true,
      users: userData,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching user wallet report:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 3️⃣ Get Transactions for a User (with filters, pagination, search, CSV export)
exports.getUserTransactions = async (req, res) => {
  try {
    const {
      keyword,
      transaction_type,
      status,
      payment_mode,
      fromDate,
      toDate,
      page = 1,
      limit = 2,
      exportCsv = "false",
    } = req.query;

    const { id } = req.params;

    const match = { user_id: new mongoose.Types.ObjectId(id) };

    if (transaction_type) match.transaction_type = transaction_type;
    if (status) match.status = status;
    if (payment_mode) match.payment_mode = payment_mode;
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
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    pipeline.push(
      // Lookup service
      {
        $lookup: {
          from: "services",
          localField: "type",
          foreignField: "_id",
          as: "service",
        },
      },
      { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },

      // Lookup plan
      {
        $lookup: {
          from: "plans",
          localField: "type",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } }
    );

    const totalCountPipeline = [{ $match: match }];
    if (keyword) {
      const regex = new RegExp(keyword, "i");
      const numVal = parseFloat(keyword);

      const keywordMatch = {
        $match: {
          $or: [
            { description: { $regex: regex } },
            { transaction_reference_id: { $regex: regex } },
            ...(isNaN(numVal) ? [] : [{ amount: numVal }]),
            { "user.UserId": { $regex: regex } },
            { "user.name": { $regex: regex } },
            { "user.email": { $regex: regex } },
          ],
        },
      };

      pipeline.push(keywordMatch);
      totalCountPipeline.push(keywordMatch);
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          user_id: 1,
          userName: "$user.name",
          userEmail: "$user.email",
          UserId: "$user.UserId",
          serviceName: { $ifNull: ["$service.name", "$plan.name"] },
          type2: 1,
          transaction_type: 1,
          amount: 1,
          gst: 1,
          tds: 1,
          charge: 1,
          totalDebit: 1,
          totalCredit: 1,
          balance_after: 1,
          status: 1,
          payment_mode: 1,
          transaction_reference_id: 1,
          description: 1,
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

    const transactions = await Transaction.aggregate(pipeline);

    if (exportCsv === "true") {
      const fields = [
        "_id",
        "user_id",
        "userName",
        "userEmail",
        "UserId",
        "transaction_type",
        "amount",
        "balance_after",
        "status",
        "payment_mode",
        "transaction_reference_id",
        "description",
        "createdAt",
      ];
      const csv = parse(transactions, { fields });
      res.header("Content-Type", "text/csv");
      res.header(
        "Content-Disposition",
        "attachment; filename=transactions.csv"
      );
      return res.send(csv);
    }

    // total count
    const totalPipeline = [...pipeline.filter((p) => !p.$skip && !p.$limit)];
    totalPipeline.push({ $count: "total" });
    totalCountPipeline.push({ $count: "total" });
    const totalResult = await Transaction.aggregate(totalCountPipeline);
    const total = totalResult[0]?.total || 0;

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
};

const CHARGE_TYPE = "percentage";
const CHARGE_VALUE = 1.5;
