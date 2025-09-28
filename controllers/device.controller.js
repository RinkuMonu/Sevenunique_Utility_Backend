const mongoose = require("mongoose");
const DeviceModal = require("../models/Device.modal");
const DeviceRequestModal = require("../models/DeviceRequest.modal");

/* --------- Devices (Admin) ---------- */

// ✅ Create Device Controller
exports.createDevice = async (req, res) => {
  try {
    const { brand, model, price, warranty, description } = req.body;

    if (!brand || !model || !price) {
      return res.status(400).json({
        success: false,
        message: "Brand, Model and Price are required",
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

    const { brand, model, price, description, warranty } = req.body;
    if (brand) device.brand = brand;
    if (model) device.model = model;
    if (price) device.price = price;
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
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/* ------- Device Requests --------- */
// Retailer creates a request
exports.createDeviceRequest = async (req, res) => {
  try {
    const { deviceId, quantity, address, remarks } = req.body;
    const r = await DeviceRequestModal.create({
      retailerId: req.user.id,
      deviceId,
      quantity,
      address,
      remarks,
    });
    res.json({ success: true, data: r });
  } catch (e) {
    console.log(e);
    res.status(400).json({ success: false, message: e.message });
  }
};

// Admin list (filters)
exports.listDeviceRequests = async (req, res) => {
  try {
    const { status, brand, from, to, q, page = 1, limit = 10 } = req.query;
    console.log(req.user);
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
      { $unwind: "$device" },

      // ✅ retailer join only name field
      {
        $lookup: {
          from: "users",
          localField: "retailerId",
          foreignField: "_id",
          as: "retailer",
          pipeline: [
            { $project: { _id: 0, name: 1 } }, // 👈 sirf name bhejega
          ],
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
            { "retailer.name": new RegExp(q, "i") },
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
  try {
    const { status, adminNote } = req.body;
    const updated = await DeviceRequestModal.findByIdAndUpdate(
      req.params.id,
      { $set: { status, adminNote } },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch {
    res.status(400).json({ success: false, message: "Update failed" });
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
