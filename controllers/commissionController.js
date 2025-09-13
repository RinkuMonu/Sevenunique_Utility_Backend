const CommissionPackage = require("../models/commissionModel.js");

exports.createPackage = async (req, res, next) => {
  console.log(req.body);
  try {
    const packageData = req.body;

    const newPackage = new CommissionPackage(packageData);
    await newPackage.save();

    res.status(201).json({
      success: true,
      message: "Commission package created successfully",
      data: newPackage,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAllPackages = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      service,
      isActive,
      packageName,
    } = req.query;

    const query = {};

    if (service) query.service = service;

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (packageName) {
      query.packageName = { $regex: packageName, $options: "i" }; // case-insensitive
    }

    const total = await CommissionPackage.countDocuments(query);
    const packages = await CommissionPackage.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: packages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPackageById = async (req, res) => {
  try {
    const packageId = req.params.id;
    const pkg = await CommissionPackage.findById(packageId);

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });
    }

    res.status(200).json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const packageId = req.params.id;
    const updates = req.body;

    const updated = await CommissionPackage.findByIdAndUpdate(
      packageId,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });
    }

    res.status(200).json({
      success: true,
      message: "Package updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePackage = async (req, res) => {
  try {
    const packageId = req.params.id;
    const deleted = await CommissionPackage.findByIdAndDelete(packageId);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Package deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const packageId = req.params.id;
    const pkg = await CommissionPackage.findById(packageId);

    if (!pkg) {
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });
    }

    pkg.isActive = !pkg.isActive;
    await pkg.save();

    res.status(200).json({
      success: true,
      message: `Package is now ${pkg.isActive ? "active" : "inactive"}`,
      data: pkg,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
