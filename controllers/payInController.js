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
      "https://api.worldpayme.com/api/v1.1/createUpiIntent",
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
          Authorization:`Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI4IiwianRpIjoiZjQyMjY2MDRmMjg2YjYwYmNmZGM2N2FmZTI1Yjc0MjEyMDI4MDEyZTUwNjYwYWY2NmJkMDAxNTIxNTIwY2IxYjRhYjljOTg4YzQ2NzQ2ZTciLCJpYXQiOjE3NTg5NTczMzguNjgyNzg2LCJuYmYiOjE3NTg5NTczMzguNjgyNzg4LCJleHAiOjE3OTA0OTMzMzguNjgwMDU3LCJzdWIiOiIyNTYiLCJzY29wZXMiOltdfQ.SuRTKARoCVWS7DXQMvQloq4Fatl2yb0hkcHOaqh1FJS1758p9xTDmQBT2E-x9pQvGKt0xl2xuBouPljGvZvMeBUpPJugY_eEh-LN0C1M9y2Hbw3aiQ_8ZyBRDhI3jMkeo6aJK9QMWhJg8S7JWSABshxB5SuT3ISFeT4P9qxXRatoqueuLfP9yBnZi440uMXP9MMnffIf04nUAojrIBrmN7xK7xmtm0q0cvIuheS1X5OuB8hU6rdSmHDyQuX9FSI8PasVPcZyj__WOSEwKoP41Oc9DblHR-xs3RyHIZkpdtwPGBqmJ8D-DujBFVWdg7MsPFmUaUP473Lp19iYrcf1LyYUU5roQu7tIcUV2-xe2YAGReg1i-a_Ae4bO46MaacdMiaTFkFZbGnCNOsYU5-PZ096z_nrgWlHXM-H558IKumRCoHTMrIDudqtTye6rVWay4V8VxL1v-6o7h9KS7EvJLLiIdPLCi1_J9-wYnG5OdHbqQT5c3r5BCB_U32WePnWduQNG4HoZsv64caD4373M1drj9lum5DPK-5YEnX2D_JOyIxTzvQCNlNrlS1NCU4gotELmIYvBcUrpiY33PXApdKBRqPwliGZwK9CVJLFYTJ-EE9X4LY-JX0yCMwpPTSvI3MPJdOdf8sM6VshaPX6XCzsxyYKXeYSlk2eMG5f4gQ`,
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
        return res
          .status(404)
          .json({ message: "User not found or inactive" });
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
