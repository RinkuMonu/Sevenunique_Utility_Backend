const express = require("express");
const router = express.Router();

// 2 controllers import karo
const roleController = require("../controllers/permissionByRoleController");


// 🔹 Role-based permissions
router.post("/add/role", roleController.createPermissionByRole);
router.get("/allrole", roleController.getAllPermissionsByRole);
router.get("/:role", roleController.getPermissionByRole);
router.put("/:role", roleController.updatePermissionByRole);
router.delete("/:role", roleController.deletePermissionByRole);

// 🔹 System/global permissions (Permission model)
router.post("/add", roleController.createPermission);  // SuperAdmin naya permission add karega
router.get("/all/all",roleController.getAllPermissions);  // Sabhi permissions list

module.exports = router;

  