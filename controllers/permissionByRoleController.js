const PermissionByRole = require("../models/PermissionByRole");
const Permission = require("../models/Permission");

// 🔹 Create role permissions
exports.createPermissionByRole = async (req, res) => {
  try {
    const { role, permissions } = req.body;

    const existing = await PermissionByRole.findOne({ role });
    if (existing) {
      return res.status(400).json({ success: false, message: "Permissions for this role already exist" });
    }

    const newPerm = new PermissionByRole({
      role,
      permissions: permissions || []
    });

    await newPerm.save();
    res.status(201).json({ success: true, data: newPerm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Get all roles & permissions
exports.getAllPermissionsByRole = async (req, res) => {
  try {
    const all = await PermissionByRole.find().populate("permissions").sort({ role: 1 });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Get one role's permissions
exports.getPermissionByRole = async (req, res) => {
  try {
    const perm = await PermissionByRole.findOne({ role: req.params.role }).populate("permissions");
    if (!perm) return res.status(404).json({ success: false, message: "Role not found" });

    res.json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Update role permissions
exports.updatePermissionByRole = async (req, res) => {
  try {
    const { permissions } = req.body;

    const updated = await PermissionByRole.findOneAndUpdate(
      { role: req.params.role },
      { permissions: permissions || [] },
      { new: true }
    ).populate("permissions");

    if (!updated) return res.status(404).json({ success: false, message: "Role not found" });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Delete role permissions
exports.deletePermissionByRole = async (req, res) => {
  try {
    const deleted = await PermissionByRole.findOneAndDelete({ role: req.params.role });
    if (!deleted) return res.status(404).json({ success: false, message: "Role not found" });

    res.json({ success: true, message: "Role permissions deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Create new global permission
exports.createPermission = async (req, res) => {
  try {
    const { key, description } = req.body;

    const existing = await Permission.findOne({ key });
    if (existing) {
      return res.status(400).json({ success: false, message: "Permission already exists" });
    }

    const perm = new Permission({ key, description });
    await perm.save();

    res.status(201).json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Get all global permissions
exports.getAllPermissions = async (req, res) => {
    console.log("Fetching all global permissions");
    
  try {
    const all = await Permission.find().sort({ key: 1 });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
   