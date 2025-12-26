const mongoose = require("mongoose");
const DeviceModal = require("../models/Device.modal");
const DeviceRequestModal = require("../models/DeviceRequest.modal");
const userModel = require("../models/userModel");
const Transaction = require("../models/transactionModel");

/* --------- Devices (Admin) ---------- */

// ✅ Create Device Controller
exports.createDevice = async (req, res) => {
  try {
    const { brand, model, price, warranty, description, gst } = req.body;

    if (!brand || !model || !price || !gst || !warranty) {
      return res.status(400).json({
        success: false,
        message: "Brand, Model ,gst ,warranty and Price are required",
      });
    }

    // ✅ multer se file aayi hai to uska path use kare
    let imagePath = "";
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    const device = await DeviceModal.create({
      brand,
      model,
      price,
      warranty,
      gst,
      description,
      image: imagePath,
    });

    res.status(201).json({
      success: true,
      message: "Device created successfully",
      data: device,
    });
  } catch (error) {
    console.error("Error in createDevice:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Modal  already exists" });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create device",
      error: error.message,
    });
  }
};

exports.listDevices = async (req, res) => {
  try {
    const { brand, q } = req.query;
    const filter = { isActive: true };
    if (brand) filter.brand = brand;
    if (q)
      filter.$or = [
        { brand: new RegExp(q, "i") },
        { model: new RegExp(q, "i") },
      ];
    const data = await DeviceModal.find(filter).sort({ brand: 1, model: 1 });
    res.json({ success: true, data });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// update device
exports.updateDevice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid device id" });
    }

    const device = await DeviceModal.findById(id);
    if (!device) {
      return res
        .status(404)
        .json({ success: false, message: "Device not found" });
    }

    const { brand, model, price, description, warranty, gst } = req.body;
    if (brand) device.brand = brand;
    if (model) device.model = model;
    if (price) device.price = price;
    if (gst) device.gst = gst;
    if (warranty) device.warranty = warranty;
    if (description) device.description = description;

    if (req.file) {
      device.image = `/uploads/${req.file.filename}`;
    }

    await device.save();

    res.json({
      success: true,
      message: "Device updated successfully",
      data: device,
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Modal  already exists" });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/* ------- Device Requests --------- */
// Retailer creates a request
const generateRequestId = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `REQ-${datePart}-${randomPart}`;
};

exports.createDeviceRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { deviceId, quantity, address, remarks } = req.body;

    const device = await DeviceModal.findById(deviceId).session(session);
    if (!device) throw new Error("Device not found");

    const retailer = await userModel.findById(req.user.id).session(session);
    if (!retailer) throw new Error("Retailer not found");


    const baseAmount = device.price * quantity;
    const gstAmount = (baseAmount * device.gst) / 100;
    const totalCost = baseAmount + gstAmount;

    // ✅ Balance check
    if (retailer.eWallet < totalCost) {
      throw new Error(
        `Insufficient balance. Required ₹${totalCost}, Available ₹${retailer.eWallet}`
      );
    }

    // ✅ CUT WALLET (IMMEDIATE)
    retailer.eWallet -= totalCost;
    await retailer.save({ session });

    // ✅ Create Device Request (PENDING)
    const request = await DeviceRequestModal.create(
      [
        {
          retailerId: retailer._id,
          deviceId,
          requestID: generateRequestId(),
          quantity,
          address,
          remarks,
          status: "PENDING",
          gstAmount,
          amount: baseAmount,
          totalCost,
        },
      ],
      { session }
    );

    // ✅ Create Transaction Report (PENDING)
    const [transaction] = await Transaction.create(
      [
        {
          user_id: retailer._id,
          transaction_type: "debit",
          amount: baseAmount,
          gst: gstAmount,
          totalDebit: totalCost,
          type2: "DEVICE Purchase",
          balance_after: retailer.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: `DEVICE-${request[0]._id}`,
          description: `Device request placed`,
          status: "Success",
        },
      ],
      { session }
    );

    // 🔗 Link transaction
    request[0].transactionId = transaction._id;
    await request[0].save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Device request submitted And Amount deducted.",
      data: request[0],
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};


// Admin list (filters)
exports.listDeviceRequests = async (req, res) => {
  try {
    const { status, brand, from, to, q, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    if (req.user.role !== "Admin") {
      filter.retailerId = new mongoose.Types.ObjectId(req.user.id);
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = d;
      }
    }

    // join brand filter
    const match = filter;
    const agg = [
      { $match: match },
      {
        $lookup: {
          from: "devices",
          localField: "deviceId",
          foreignField: "_id",
          as: "device",
        },
      },
      { $unwind: { path: "$device", preserveNullAndEmptyArrays: true } },

      // ✅ retailer join only name field
      {
        $lookup: {
          from: "users",
          localField: "retailerId",
          foreignField: "_id",
          as: "retailer",
          pipeline: [{ $project: { _id: 0, name: 1, UserId: 1 } }],
        },
      },
      { $unwind: { path: "$retailer", preserveNullAndEmptyArrays: true } },
    ];

    if (brand) {
      agg.push({
        $match: {
          "device.brand": new RegExp(brand, "i"),
        },
      });
    }

    if (q) {
      agg.push({
        $match: {
          $or: [
            { remarks: new RegExp(q, "i") },
            { address: new RegExp(q, "i") },
            { requestID: new RegExp(q, "i") },
            { "retailer.name": new RegExp(q, "i") },
            { "retailer.UserId": new RegExp(q, "i") },
          ],
        },
      });
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, countArr] = await Promise.all([
      DeviceRequestModal.aggregate([
        ...agg,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
      ]),
      DeviceRequestModal.aggregate([...agg, { $count: "cnt" }]),
    ]);

    const total = countArr[0]?.cnt || 0;
    res.json({
      success: true,
      data: items,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin update status/note

exports.updateDeviceRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { status, adminNote } = req.body;

    const request = await DeviceRequestModal
      .findById(req.params.id)
      .session(session);

    if (!request) throw new Error("Request not found");

    // 🔒 lock
    if (["APPROVED", "REJECTED"].includes(request.status)) {
      throw new Error("Final status already set. Cannot modify.");
    }

    const retailer = await userModel.findById(request.retailerId).session(session);
    const debitTxn = await Transaction.findById(request.transactionId).session(session);

    if (!retailer || !debitTxn) {
      throw new Error("Linked data missing");
    }

    // ✅ APPROVE
    if (status === "APPROVED") {
      request.status = "APPROVED";
      // debitTxn.status = "Success";
      debitTxn.description = "Device Request Approved";
    }

    // ❌ REJECT → REFUND
    if (status === "REJECTED") {
      // 🔁 wallet refund
      retailer.eWallet += request.totalCost;
      await retailer.save({ session });

      // mark debit as failed
      // ✅ CREATE SEPARATE CREDIT TRANSACTION
      await Transaction.create(
        [
          {
            user_id: retailer._id,
            type2: "DEVICE Purchase",
            transaction_type: "credit",
            totalCredit: request.totalCost,
            amount: request.totalCost,
            balance_after: retailer.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: `D-R-R-${Date.now()}`,
            description: "Refund for rejected device request",
            status: "Success",
          },
        ],
        { session }
      );

      request.status = "REJECTED";
    }

    request.adminNote = adminNote || request.adminNote;

    await request.save({ session });
    await debitTxn.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message:
        status === "APPROVED"
          ? "Request approved successfully"
          : "Request rejected and amount refunded",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};



// delete device

exports.deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;

    const device = await DeviceModal.findById(id);
    if (!device) {
      return res
        .status(404)
        .json({ success: false, message: "Device not found" });
    }

    await DeviceModal.findByIdAndDelete(id);

    res.json({ success: true, message: "Device deleted successfully" });
  } catch (error) {
    console.error("Delete device error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
