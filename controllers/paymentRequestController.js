const mongoose = require("mongoose");
const PaymentRequest = require("../models/paymentRequest");
const User = require("../models/userModel");
const PayIn = require("../models/payInModel");
const Transaction = require("../models/transactionModel");

exports.createPaymentRequest = async (req, res) => {
  console.log(req.body," body in create payment request");
     
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let transactionSSPath = null;
    if (req.file) {
      transactionSSPath = `/uploads/${req.file.filename}`;
    }
    const paymentRequest = new PaymentRequest({
      ...req.body,
      userId: req?.user?.id,
      transactionSS: transactionSSPath || req.body.transactionSS || null,
    });
    await paymentRequest.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ success: true, data: paymentRequest });
  } catch (error) {
    // console.log(error," error in create payment request");
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPaymentRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const paymentRequest = await PaymentRequest.findById(id);

    if (!paymentRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Payment request not found" });
    }

    return res.status(200).json({ success: true, data: paymentRequest });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listPaymentRequests = async (req, res) => {
  try {
    const {
      reference,
      mode,
      status,
      fromDate,
      toDate,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const filter = {};

    // ✅ Role-based filter
    if (req.user.role !== "Admin") {
      filter.userId = req.user.id;
    }

    if (reference) filter.reference = reference;
    if (mode) filter.mode = mode;
    if (status) filter.status = status;
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    // ✅ Search filter (includes user.name)
    if (search) {
      const regex = new RegExp(search, "i");
      const users = await User.find({ name: regex }, { _id: 1 });
      const userIds = users.map((u) => u._id);

      filter.$or = [
        { reference: regex },
        { description: regex },
        { remark: regex },
        { requestId: regex },
        { amount: regex },
        { userId: { $in: userIds } },
        { "bankDetails.accountName": regex },
        { "upiDetails.vpa": regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // ✅ Fetch with populate (UI ke liye userId.name aayega)
    const [data, total] = await Promise.all([
      PaymentRequest.find(filter)
        .populate("userId", "name") // 👈 name include hoga
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      PaymentRequest.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePaymentRequestStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, remark, completedAt } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status is required" });
    }

    const paymentRequest = await PaymentRequest.findById(id).session(session);
    if (!paymentRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Payment request not found" });
    }

    if (paymentRequest.status === status) {
      return res.status(400).json({
        success: false,
        message: "New status must be different from the current status",
      });
    }

    if (["Completed", "Failed"].includes(paymentRequest.status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a finalized transaction",
      });
    }

    paymentRequest.status = status;
    if (completedAt) paymentRequest.completedAt = completedAt;
    if (remark) paymentRequest.remark = remark;

    await paymentRequest.save({ session });

    if (status === "Completed") {
      const user = await User.findById(paymentRequest.userId).session(session);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const currentBalance = user.eWallet || 0;
      const newBalance = currentBalance + paymentRequest.amount;
      user.eWallet = newBalance;
      await user.save({ session });

      const payIn = new PayIn({
        userId: user._id,
        amount: paymentRequest.amount,
        reference: paymentRequest.reference,
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        utr: paymentRequest.utr || null,
        remark: paymentRequest.description || "Payment completed via request",
      });
      await payIn.save({ session });

      const ledgerEntry = new Transaction({
        user_id: user._id,
        transaction_type: "credit",
        amount: currentBalance,
        balance_after: newBalance,
        status: "Success",
        payment_mode: "bank_transfer",
        transaction_id: paymentRequest.reference,
        description: "Wallet top-up via payment request",
        meta: {
          source: "PaymentRequest",
          request_id: paymentRequest.requestId,
        },
      });
      await ledgerEntry.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      data: paymentRequest,
      message: `Payment request ${
        status === "Completed"
          ? "completed and wallet updated"
          : "status updated"
      }`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};
