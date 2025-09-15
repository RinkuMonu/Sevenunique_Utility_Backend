const express = require("express");
const router = express.Router();
const upload = require("../utils/uplods.js");
const {
  sendOtpController,
  verifyOTPController,
  registerUser,
  loginController,
  updateProfileController,
  getUserController,
  getUsersWithFilters,
  updateUserStatus,
  updateUserDetails,
  getDashboardStats,
  getUserPermissions,
  updateUserPermissions,
} = require("../controllers/authController.js");
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");

router.post("/send-otp", sendOtpController);
router.post("/verify-otp", verifyOTPController);
router.post(
  "/register",
  upload.fields([
    { name: "shopPhoto", maxCount: 6 }, // ✅ Multiple allowed
    { name: "ownerPhoto", maxCount: 1 },
    { name: "shopAddressProof", maxCount: 1 }, // retailer ke liye
    { name: "officeAddressProof", maxCount: 1 }, // distributor ke liye
    { name: "directorKycFiles", maxCount: 4 },
    { name: "boardResolution", maxCount: 1 },   
  ]),
  registerUser
);

router.post("/login", loginController);
router.put("/profile", authenticateToken, updateProfileController);  
router.get("/profile", authenticateToken, getUserController);
router.get(
  "/users",
  authenticateToken,
  authorizeRoles("Admin", "Distributor"),
  getUsersWithFilters
);
router.put(
  "/user/:id/status",
  authenticateToken,
  authorizeRoles("Admin"),
  updateUserStatus
);
router.put(
  "/user/:id",
  authenticateToken,
  authorizeRoles("Admin"),
  updateUserDetails
);
router.get(
  "/dashboard",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getDashboardStats
);
router.put(
  "/users/:id/permissions",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  updateUserPermissions
);
router.get(
  "/users/:id/permissions",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getUserPermissions
);

module.exports = router;
