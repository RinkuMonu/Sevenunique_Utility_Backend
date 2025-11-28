const PermissionByRole = require("../models/PermissionByRole");
const Permission = require("../models/Permission");
const userModel = require("../models/userModel");

// 🔹 Create role permissions
exports.createPermissionByRole = async (req, res) => {
  try {
    const { role, permissions } = req.body;

    const existing = await PermissionByRole.findOne({ role });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Permissions for this role already exist",
      });
    }

    const newPerm = new PermissionByRole({
      role,
      permissions: permissions || [],
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
    const all = await PermissionByRole.find()
      .populate("permissions")
      .sort({ role: 1 });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Get one role's permissions
exports.getPermissionByRole = async (req, res) => {
  try {
    const perm = await PermissionByRole.findOne({
      role: req.params.role,
    }).populate("permissions");
    if (!perm)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

    res.json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
    console.log("qqqqqqqqqqqqqqqqqqq", error);
  }
};

// 🔹 Update role permissions role per
exports.updatePermissionByRole = async (req, res) => {
  try {
    const { permissions } = req.body;

    const updated = await PermissionByRole.findOneAndUpdate(
      { role: req.params.role },
      { permissions: permissions || [] },
      { new: true }
    ).populate("permissions");

    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
    console.log(error);
  }
};

// 🔹 Update role name
exports.updateRoleName = async (req, res) => {
  try {
    const { role } = req.params; // old role name
    const { newRole } = req.body; // new role name

    const updated = await PermissionByRole.findOneAndUpdate(
      { role },
      { role: newRole }, // 👈 ab role name update karega
      { new: true }
    );

    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Delete role permissions
exports.deletePermissionByRole = async (req, res) => {
  try {
    const deleted = await PermissionByRole.findOneAndDelete({
      role: req.params.role,
    });
    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });

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
      return res
        .status(400)
        .json({ success: false, message: "Permission already exists" });
    }

    const perm = new Permission({ key, description });
    await perm.save();

    res.status(201).json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `This Permission already exist`,
        field: field[0],
        value: value,
      });
    }
  }
};

// 🔹 Get all global permissions
exports.getAllPermissions = async (req, res) => {
  try {
    const { key } = req.query;
    const filter = {};
    if (key) {
      filter.key = { $regex: key, $options: "i" };
    }
    const all = await Permission.find(filter).sort({ key: 1 });
    res.json({ success: true, data: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// Get all roles

exports.getAllRole = async (req, res) => {
  try {
    const roles = await PermissionByRole.find();

    // Empty roles case handle
    if (!roles || roles.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No roles found",
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "All roles fetched successfully",
      data: roles,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch roles",
      error: error.message,
    });
  }
};

// 🔹 Update a global permission
exports.updatePermission = async (req, res) => {
  try {
    const { key } = req.body;

    const updated = await Permission.findByIdAndUpdate(
      req.params.id,
      { key },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Permission not found" });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 🔹 Delete a global permission
exports.deletePermission = async (req, res) => {
  console.log("Deleting permission with ID:", req.params.id);

  try {
    const deleted = await Permission.findByIdAndDelete(req.params.id);
    console.log(deleted);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Permission not found" });
    }

    // also remove this permission from all roles that reference it
    await PermissionByRole.updateMany(
      { permissions: deleted._id },
      { $pull: { permissions: deleted._id } }
    );

    res.json({ success: true, message: "Permission deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// 🔹 Get user permissions (rolePer + extraPer - restrictedPer)

exports.getUserPermissions = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("Fetching permissions for user ID:", userId);

    const user = await userModel
      .findById(userId)
      .populate("extraPermissions")
      .populate("restrictedPermissions")
      .populate({
        path: "rolePermissions",
        populate: { path: "permissions" },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 👉 Extract all permissions
    const rolePerms = user.rolePermissions?.permissions || [];
    const extraPerms = user.extraPermissions || [];
    const restrictedPerms = user.restrictedPermissions || [];

    // 👉 Convert to sets of keys
    let finalSet = new Set();

    // 1️⃣ Add role permissions
    rolePerms.forEach((p) => finalSet.add(p.key));

    // 2️⃣ Add extra permissions (override role-based)
    extraPerms.forEach((p) => finalSet.add(p.key));

    // 3️⃣ Remove restricted permissions
    restrictedPerms.forEach((p) => finalSet.delete(p.key));

    // 👉 Convert back to array
    const effectivePermissions = Array.from(finalSet);

    // 👉 Send full response
    res.json({
      success: true,
      role: user.role,

      rolePermissions: rolePerms,
      extraPermissions: extraPerms,
      restrictedPermissions: restrictedPerms,

      effectivePermissions, // 🔥 final permissions (role + extra - restricted)

      totalRolePermissions: rolePerms.length,
      totalExtraPermissions: extraPerms.length,
      totalRestrictedPermissions: restrictedPerms.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
    console.log("eeeeeeeeeeeeeeeeeeeee", error);
  }
};
