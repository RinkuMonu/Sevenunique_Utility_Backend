const express = require("express");
const router = express.Router();
const {
    createPackage,
    getAllPackages,
    getPackageById,
    updatePackage,
    deletePackage,
    toggleStatus,
} = require("../controllers/commissionController.js");
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");

router.post("/", authenticateToken, authorizeRoles("Admin"), createPackage);

router.get("/", authenticateToken, authorizeRoles("Admin"), getAllPackages);

router.get("/:id", authenticateToken, authorizeRoles("Admin"), getPackageById);

router.put("/:id", authenticateToken, authorizeRoles("Admin"), updatePackage);

router.delete("/:id", authenticateToken, authorizeRoles("Admin"), deletePackage);

router.put("/:id/status", authenticateToken, authorizeRoles("Admin"), toggleStatus);

module.exports = router;
