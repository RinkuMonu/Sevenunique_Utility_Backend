const express = require("express");
const router = express.Router();

// 2 controllers import karo
const roleController = require("../controllers/permissionByRoleController");

// 🔹 Role-based permissions role create dlt put
router.post("/add/role", roleController.createPermissionByRole);
router.get("/allrole", roleController.getAllPermissionsByRole);
router.put("/rolename/:role", roleController.updateRoleName);


//action
router.get("/singleuser/:id", roleController.getUserPermissions);//dd   
router.get("/getAllpermissionByGroup", roleController.getGroupedPermissions);//dd   
router.get("/:role", roleController.getPermissionByRole);//dd
router.put("/:role", roleController.updatePermissionByRole);//ddd
router.delete("/:role", roleController.deletePermissionByRole);
// 🔹 System/global permissions (Permission model)



// create dlt put permission
router.post("/add", roleController.createPermission); // SuperAdmin naya permission add karega
router.get("/all/all", roleController.getAllPermissions); // Sabhi permissions list dd
router.delete("/deletePermission/:id", roleController.deletePermission); // Sabhi permissions list
router.put("/editPermission/:id", roleController.updatePermission); // Sabhi permissions list

module.exports = router;
