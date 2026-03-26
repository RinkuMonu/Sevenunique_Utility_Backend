const PermissionByRole = require("../models/PermissionByRole");
const Permission = require("../models/Permission");
const userModel = require("../models/userModel");
const { invalidateProfileCache, invalidatePermissionsCache, invalidateUserPermissionsCache } = require("../middleware/redisValidation");
const redis = require("../middleware/redis");

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
// exports.updatePermissionByRole = async (req, res) => {
//   try {
//     const { permissions } = req.body;

//     const updated = await PermissionByRole.findOneAndUpdate(
//       { role: req.params.role },
//       { permissions: permissions || [] },
//       { new: true }
//     ).populate("permissions");

//     if (!updated)
//       return res
//         .status(404)
//         .json({ success: false, message: "Role not found" });

//     res.json({ success: true, data: updated });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//     console.log(error);
//   }
// };
exports.updatePermissionByRole = async (req, res) => {
  try {
    const { permissions } = req.body;
    const roleName = req.params.role;

    // 1️⃣ Role document update
    const updated = await PermissionByRole.findOneAndUpdate(
      { role: roleName },
      { permissions: permissions || [] },
      { new: true }
    ).populate("permissions");

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Role not found" });
    }
    // 2️⃣ Sab users jinke paas ye role hai, unko link karo
    await userModel.updateMany(
      { role: roleName },
      { rolePermissions: updated._id }
    );
    // 🔥 Cache invalidation

    const users = await userModel.find({ role: roleName }, { _id: 1 });

    for (const u of users) {
      await invalidateProfileCache(u._id || u.id);
      await invalidateUserPermissionsCache(u._id || u.id);
    }


    res.json({ success: true, data: updated });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
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
    const { key, description, parentKey } = req.body;

    const existing = await Permission.findOne({ key });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Permission already exists" });
    }

    const perm = new Permission({ key, description, parentKey: parentKey || null, });
    await perm.save();
    await invalidatePermissionsCache()

    res.status(201).json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `This Permission already exist`,
        field: field[0] ?? null,
        value: value,
      });
    }
  }
};

// 🔹 Get all global permissions
exports.getAllPermissions = async (req, res) => {
  console.log("hitssss perrr")
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
    const cacheKey = `permissions:user:${userId}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log("⚡ SINGL USER PERMISSIONS REDIS HIT");
          return res.json(JSON.parse(cached));
        }
        console.log("❌ USER PERMISSIONS REDIS MISS");
      } catch {
        console.log("Redis get failed, fallback to DB");
      }
    }

    // ✅ 1. USER FETCH
    const user = await userModel
      .findById(userId)
      .populate("extraPermissions")
      .populate("restrictedPermissions")
      .populate("rolePermissions");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ 2. ROLE SE PERMISSIONS NIKALO
    let rolePerms = [];

    if (user.rolePermissions) {
      const roleData = await PermissionByRole.findById(
        user.rolePermissions
      ).populate("permissions");

      rolePerms = roleData?.permissions || [];
    }

    const extraPerms = user.extraPermissions || [];
    const restrictedPerms = user.restrictedPermissions || [];

    // ✅ 3. FINAL EFFECTIVE IDS
    let finalIdSet = new Set();

    rolePerms.forEach((p) => finalIdSet.add(p._id.toString()));
    extraPerms.forEach((p) => finalIdSet.add(p._id.toString()));
    restrictedPerms.forEach((p) => finalIdSet.delete(p._id.toString()));

    const effectivePermissionIds = Array.from(finalIdSet);

    // ✅ 4. GROUPED PERMISSIONS
    const all = await Permission.find().lean();

    const grouped = {};

    all.forEach((perm) => {
      if (!perm.parentKey) {
        grouped[perm.key] = {
          parent: perm,
          children: [],
        };
      }
    });

    all.forEach((perm) => {
      if (perm.parentKey && grouped[perm.parentKey]) {
        grouped[perm.parentKey].children.push(perm);
      }
    });
    const responseData = {
      success: true,
      role: user.role,

      rolePermissions: rolePerms,
      extraPermissions: extraPerms,
      restrictedPermissions: restrictedPerms,

      effectivePermissionIds, // ✅ checkbox ke liye
      groupedPermissions: grouped, // ✅ menu + sub menu ke liye

      totalRolePermissions: rolePerms.length,
      totalExtraPermissions: extraPerms.length,
      totalRestrictedPermissions: restrictedPerms.length,
    }

    // ✅ 5. RESPONSE (USER + GROUP SATH ME)
    // res.json({
    //   success: true,
    //   role: user.role,

    //   rolePermissions: rolePerms,
    //   extraPermissions: extraPerms,
    //   restrictedPermissions: restrictedPerms,

    //   effectivePermissionIds, // ✅ checkbox ke liye
    //   groupedPermissions: grouped, // ✅ menu + sub menu ke liye

    //   totalRolePermissions: rolePerms.length,
    //   totalExtraPermissions: extraPerms.length,
    //   totalRestrictedPermissions: restrictedPerms.length,
    // });

    if (redis) {
      try {
        await redis.setex(
          cacheKey,
          30000,
          JSON.stringify(responseData)
        );
      } catch {
        console.log("Redis set failed for user permissions");
      }
    }
    return res.json(responseData);

  } catch (err) {
    console.log("Permission API Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }

};

//get all permissions by group

exports.getGroupedPermissions = async (req, res) => {
  try {
    let cacheKey = null
    if (redis) {
      cacheKey = `getAllPermission:`;
      // console.log("CACHE KEY:", cacheKey);
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          console.log("Get all Permission Hit from REDIS");
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (e) {
        console.log("Redis Permission get failed, skipping cache");
      }
    }

    const all = await Permission.find().lean();

    const grouped = {};

    // ✅ STEP 1: Sab unique parentKey ko parent banao
    all.forEach((perm) => {
      if (perm.parentKey && !grouped[perm.parentKey]) {
        grouped[perm.parentKey] = {
          parent: {
            key: perm.parentKey,
            _id: null,            // jab parent record alag ho to yaha _id aa jayega
            description: perm.parentKey,
          },
          children: [],
        };
      }
    });

    // ✅ STEP 2: Children attach karo
    all.forEach((perm) => {
      if (perm.parentKey && grouped[perm.parentKey]) {
        grouped[perm.parentKey].children.push(perm);
      }
    });
    const responseData = {
      success: true,
      data: grouped,
    }
    if (cacheKey && redis) {
      try {
        await redis.setex(
          cacheKey,
          32450,
          JSON.stringify(responseData)
        )
      } catch {
        console.log("redis set failed from all permisson get api")
      }
    }
    return res.json(responseData)
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
