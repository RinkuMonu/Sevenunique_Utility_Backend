const mongoose = require("mongoose");
const PaymentRequest = require("../models/paymentRequest");
const User = require("../models/userModel");
const PayIn = require("../models/payInModel");
const Transaction = require("../models/transactionModel");
const { invalidateUsersCache, invalidateProfileCache } = require("../middleware/redisValidation");
const payOutModel = require("../models/payOutModel");
const payInModel = require("../models/payInModel");
const userModel = require("../models/userModel");
const userMetaModel = require("../models/userMetaModel");
const { default: admin } = require("../firebase");

exports.createPaymentRequest = async (req, res) => {
  console.log(req.body, " body in create payment request");

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
    console.log(req.query);

    const filter = {};

    if (req.user.role === "Admin") {
    } else if (req.user.role === "Distributor") {
      filter.$or = [{ userId: req.user.id }, { sender_Id: req.user.id }];
    } else if (req.user.role === "Retailer") {
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

    if (search) {
      const regex = new RegExp(search, "i");
      const users = await User.find({ name: regex }, { _id: 1 });
      const userIds = users.map((u) => u._id);

      const orConditions = [
        { reference: regex },
        { description: regex },
        { remark: regex },
        { requestId: regex },
        { userId: { $in: userIds } },
        { "bankDetails.accountName": regex },
        { "upiDetails.vpa": regex },
      ];

      if (!isNaN(search)) {
        orConditions.push({ amount: Number(search) });
      }

      filter.$or = orConditions;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    const [data, total] = await Promise.all([
      PaymentRequest.find(filter)
        .populate("userId", "name role email UserId")
        .populate("sender_Id", "name role email")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      PaymentRequest.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      pagination: {
        currentPage: parseInt(page),
        total,
        totalPages: Math.ceil(total / limit),
      },
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
    const sender = req.user;

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
        message: "Cannot update a after it is marked Completed or Failed",
      });
    }

    paymentRequest.status = status;
    if (completedAt) paymentRequest.completedAt = completedAt;
    if (remark) paymentRequest.remark = remark;
    if (sender) {
      paymentRequest.sender_Id = sender.id || sender._id;
    }
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
      ``;
      await payIn.save({ session });

      const ledgerEntry = new Transaction({
        user_id: user._id,
        transaction_type: "credit",
        type2: "Fund Transfer",
        transaction_reference_id: paymentRequest.reference,
        amount: currentBalance,
        balance_after: newBalance,
        status: "Success",
        totalDebit: paymentRequest.transactionType === "debit" ? paymentRequest.amount : 0,
        totalCredit: paymentRequest.transactionType === "credit" ? paymentRequest.amount : 0,
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
      message: `Payment request ${status === "Completed"
        ? "completed and wallet updated"
        : "status updated"
        }`,
    });
  } catch (error) {
    console.log(error);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.fundTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { recipientId, amount, mode, reason } = req.body;

    if (!recipientId || !amount || !mode || !reason) {
      return res.status(400).json({
        success: false,
        message: "recipientId, amount, mode and reason are required",
      });
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });

    // sender = logged in user (Admin or Distributor)
    const sender = await User.findById(req.user.id).session(session);
    if (!sender)
      return res
        .status(404)
        .json({ success: false, message: "Sender not found" });

    const recipient = await User.findById(recipientId).session(session);
    if (!recipient)
      return res
        .status(404)
        .json({ success: false, message: "Recipient not found" });

    if (mode === "debit") {
      if (sender.role === "Admin") {
        if ((recipient.eWallet || 0) < amt) {
          return res.status(400).json({
            success: false,
            message: "Debitor has insufficient balance",
          });
        }
        recipient.eWallet -= amt;
      } else {
        if ((recipient.eWallet || 0) < amt) {
          return res.status(400).json({
            success: false,
            message: "Debitor has insufficient balance",
          });
        }
        recipient.eWallet -= amt;
        sender.eWallet += amt;
      }
    } else if (mode === "credit") {
      if (sender.role === "Admin") {
        recipient.eWallet += amt;
      } else {
        if ((sender.eWallet || 0) < amt) {
          return res.status(400).json({
            success: false,
            message: "Sender has insufficient balance",
          });
        }
        sender.eWallet -= amt;
        recipient.eWallet += amt;
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid mode" });
    }

    await sender.save({ session });
    await recipient.save({ session });

    // Ledger/Transaction entry
    const transaction = new Transaction({
      user_id: recipient._id,
      sender_Id: sender._id,
      type2: "Fund Transfer",
      transaction_type: mode === "debit" ? "debit" : "credit",
      amount: amt,
      balance_after: recipient.eWallet,
      totalDebit: mode === "debit" ? amt : 0,
      totalCredit: mode === "credit" ? amt : 0,
      status: "Success",
      payment_mode: "wallet",
      transaction_reference_id: `FT-${Date.now()}`,
      description: reason,
      meta: {
        source: "FundTransfer",
        recipientType: recipient.role,
      },
    });
    await transaction.save({ session });

    // Optional PayIn for recipient if mode=credit
    if (mode === "credit") {
      const payIn = new PayIn({
        userId: recipient._id,
        fromUser: sender._id,
        amount: amt,
        reference: transaction.transaction_reference_id,
        name: recipient.name,
        mobile: recipient.mobileNumber,
        email: recipient.email,
        status: "Success",
        remark: reason,
      });
      await payIn.save({ session });
    }

    const paymentRequest = new PaymentRequest({
      userId: recipient._id,
      sender_Id: sender._id,
      reference: transaction.transaction_reference_id,
      mode: "Wallet", // Fund Transfer
      amount: amt,
      transactionType: mode,
      description: reason,
      status: "Completed",
      completedAt: new Date(),
      txnDate: new Date(),
    });
    await paymentRequest.save({ session });
    await invalidateUsersCache()
    await invalidateProfileCache(recipientId)
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Fund transfer ${mode} successful`,
      data: {
        senderBalance: sender.eWallet,
        recipientBalance: recipient.eWallet,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

exports.walletTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  let committed = false;

  try {
    session.startTransaction();

    const senderId = req.user.id;
    const { receiverData, amount, mpin } = req.body;

    if (!amount || Number(amount) < 1) {
      throw new Error("Minimum transfer amount is ₹1");
    }

    if (!mpin) {
      throw new Error("MPIN required");
    }

    // 🔹 Fetch Sender
    const sender = await userModel.findById(senderId).session(session);
    if (!sender) throw new Error("Sender not found");

    // if (sender.role !== "Retailer") {
    //   throw new Error("Only retailers can transfer money");
    // }

    if (sender.mpin != mpin) {
      throw new Error("Invalid MPIN");
    }

    // 🔹 Find Receiver
    let receiver;

    if (/^[0-9]{10}$/.test(receiverData)) {
      receiver = await userModel.findOne({ mobileNumber: receiverData });
    } else {
      receiver = await userModel.findOne({ UserId: receiverData });
    }

    if (!receiver) throw new Error("Receiver not found");

    if (receiver._id.toString() === sender._id.toString()) {
      throw new Error("Cannot transfer to yourself");
    }

    // if (receiver.role !== "Retailer") {
    //   throw new Error("Receiver must be a retailer");
    // }

    // 🔹 White-label restriction (if exists)
    // if (sender.whitelabelId && receiver.whitelabelId) {
    //   if (sender.whitelabelId.toString() !== receiver.whitelabelId.toString()) {
    //     throw new Error("Cross white-label transfer not allowed");
    //   }
    // }

    const transferAmount = Number(amount);

    if (sender.eWallet < transferAmount) {
      throw new Error("Insufficient wallet balance");
    }

    const referenceId = `WLT${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    // 🔹 Deduct from sender
    const updatedSender = await userModel.findOneAndUpdate(
      { _id: sender._id, eWallet: { $gte: transferAmount } },
      { $inc: { eWallet: -transferAmount } },
      { new: true, session }
    );

    if (!updatedSender) throw new Error("Wallet deduction failed");

    // 🔹 Credit to receiver
    const updatedReceiver = await userModel.findOneAndUpdate(
      { _id: receiver._id },
      { $inc: { eWallet: transferAmount } },
      { new: true, session }
    );

    const senderMeta = await userMetaModel.findOne({ userId: sender._id });
    const receiverMeta = await userMetaModel.findOne({ userId: receiver._id });

    // 🔹 Sender Ledger Entry
    await Transaction.create([{
      user_id: sender._id,
      transaction_type: "debit",
      amount: transferAmount,
      type2: "Wallet transfer",
      totalDebit: transferAmount,
      balance_after: updatedSender.eWallet,
      transaction_reference_id: referenceId,
      description: `Sent to ${receiver.name}`,
      status: "Success"
    }], { session });

    await payOutModel.create([{
      userId: sender._id,
      amount: Number(transferAmount),
      type2: "Wallet transfer",
      reference: referenceId,
      trans_mode: "WALLET",
      name: sender.name,
      mobile: sender.mobileNumber,
      email: sender.email,
      status: "Success",
      totalDebit: transferAmount,
      remark: `Money Transfer for Retailer ID ${receiverData}`
    }], { session });

    // 🔹 Receiver Ledger Entry
    await Transaction.create([{
      user_id: receiver._id,
      transaction_type: "credit",
      amount: transferAmount,
      type2: "Wallet transfer",
      totalCredit: transferAmount,
      balance_after: updatedReceiver.eWallet,
      transaction_reference_id: referenceId,
      description: `Received from ${sender.name}`,
      status: "Success"
    }], { session });

    await payInModel.create([{
      userId: receiver._id,
      amount: transferAmount,
      reference: referenceId,
      name: receiver.name,
      mobile: receiver.mobileNumber,
      email: receiver.email,
      status: "Success",
      source: "TopUp",
      remark: `Money Receive for Retailer ID ${sender.UserId}`
    }], { session });


    await session.commitTransaction();
    committed = true;
    session.endSession();

    const notifications = [];

    if (senderMeta?.fcm_Token) {
      notifications.push(
        admin.messaging().send({
          token: senderMeta.fcm_Token,
          notification: {
            title: "Finunique",
            body: `₹ ${transferAmount || "0.00"} transferred to ${receiver?.name || "User"}`,
          }
        })
      );
    }

    if (receiverMeta?.fcm_Token) {
      notifications.push(
        admin.messaging().send({
          token: receiverMeta.fcm_Token,
          notification: {
            title: "Finunique",
            body: `₹ ${transferAmount || "0.00"} received from ${sender?.name || "User"}`,
          }
        })
      );
    }

if (notifications.length > 0) {
  Promise.allSettled(notifications).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`❌ FCM Error [${index}]`, result.reason?.message);
      }
    });
  });
}

    return res.status(200).json({
      success: true,
      message: "Wallet transfer successful",
      referenceId
    });

  } catch (error) {
    console.error("Wallet Transfer Error:", error);

    if (!committed) {
      await session.abortTransaction();
      session.endSession();
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Transfer failed"
    });
  }
};


// exports.payViaQR = async (req, res) => {
//   const session = await mongoose.startSession();
//   let committed = false;

//   try {
//     session.startTransaction();

//     const senderId = req.user.id;
//     const { token, amount, mpin } = req.body;

//     if (!amount || Number(amount) < 1) {
//       throw new Error("Invalid transfer amount");
//     }

//     if (!mpin) {
//       throw new Error("MPIN required");
//     }

//     const transferAmount = Number(amount);

//     // 🔐 Verify QR Token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     if (decoded.type !== "payment") {
//       throw new Error("Invalid QR");
//     }

//     // 🔹 Fetch Sender
//     const sender = await userModel.findById(senderId).session(session);
//     if (!sender) throw new Error("Sender not found");

//     if (sender.mpin != mpin) {
//       throw new Error("Invalid MPIN");
//     }

//     if (sender.eWallet < transferAmount) {
//       throw new Error("Insufficient wallet balance");
//     }

//     // 🔹 Fetch Receiver from QR
//     const receiver = await userModel
//       .findOne({ mobileNumber: decoded.mobileNumber })
//       .session(session);

//     if (!receiver) throw new Error("Receiver not found");

//     if (receiver._id.toString() === sender._id.toString()) {
//       throw new Error("Cannot pay yourself");
//     }

//     const referenceId = `QR${Date.now()}${Math.floor(
//       1000 + Math.random() * 9000
//     )}`;

//     // 🔹 Deduct Sender (Atomic)
//     const updatedSender = await userModel.findOneAndUpdate(
//       { _id: sender._id, eWallet: { $gte: transferAmount } },
//       { $inc: { eWallet: -transferAmount } },
//       { new: true, session }
//     );

//     if (!updatedSender) throw new Error("Wallet deduction failed");

//     // 🔹 Credit Receiver
//     const updatedReceiver = await userModel.findOneAndUpdate(
//       { _id: receiver._id },
//       { $inc: { eWallet: transferAmount } },
//       { new: true, session }
//     );

//     // 🔹 Sender Ledger
//     await Transaction.create(
//       [
//         {
//           user_id: sender._id,
//           transaction_type: "debit",
//           amount: transferAmount,
//           type2: "qr_payment",
//           totalDebit: transferAmount,
//           balance_after: updatedSender.eWallet,
//           transaction_reference_id: referenceId,
//           description: `QR Payment to ${receiver.name}`,
//           status: "Success",
//         },
//       ],
//       { session }
//     );

//     await payOutModel.create(
//       [
//         {
//           userId: sender._id,
//           amount: transferAmount,
//           type2: "qr_payment",
//           reference: referenceId,
//           trans_mode: "WALLET",
//           name: sender.name,
//           mobile: sender.mobileNumber,
//           email: sender.email,
//           status: "Success",
//           totalDebit: transferAmount,
//           remark: `QR Payment to ${receiver.UserId}`,
//         },
//       ],
//       { session }
//     );

//     // 🔹 Receiver Ledger
//     await Transaction.create(
//       [
//         {
//           user_id: receiver._id,
//           transaction_type: "credit",
//           amount: transferAmount,
//           type2: "qr_payment",
//           totalCredit: transferAmount,
//           balance_after: updatedReceiver.eWallet,
//           transaction_reference_id: referenceId,
//           description: `QR Payment received from ${sender.name}`,
//           status: "Success",
//         },
//       ],
//       { session }
//     );

//     await payInModel.create(
//       [
//         {
//           userId: receiver._id,
//           amount: transferAmount,
//           reference: referenceId,
//           name: receiver.name,
//           mobile: receiver.mobileNumber,
//           email: receiver.email,
//           status: "Success",
//           source: "QR_PAYMENT",
//           remark: `QR Payment from ${sender.UserId}`,
//         },
//       ],
//       { session }
//     );

//     await session.commitTransaction();
//     committed = true;
//     session.endSession();

//     return res.status(200).json({
//       success: true,
//       message: "QR Payment successful",
//       referenceId,
//     });
//   } catch (error) {
//     console.error("QR Payment Error:", error);

//     if (!committed) {
//       await session.abortTransaction();
//       session.endSession();
//     }

//     return res.status(400).json({
//       success: false,
//       message: error.message || "QR Payment failed",
//     });
//   }
// };


