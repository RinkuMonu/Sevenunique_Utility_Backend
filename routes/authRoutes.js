const express = require("express");
const   router = express.Router();

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
  getServiceUsage,
  getPayInPayOutReport,
  getUserId,
  updateCredential,
  updateProgress,
  getLoginHistory,
  updateUserDocs,
} = require("../controllers/authController.js");
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");
const upload = require("../utils/uplods.js");

const multerErrorHandler = (err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File size should not exceed 10MB.",
    });
  }

  if (err.message === "Only image or PDF files are allowed!") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(400).json({
    success: false,
    message: err.message || "File upload error",
  });
};

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
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "bankDocument", maxCount: 1 },
  ]),
  multerErrorHandler,
  registerUser
);
router.put(
  "/update-docs/:id",
  upload.fields([
    { name: "shopPhoto", maxCount: 6 },
    { name: "ownerPhoto", maxCount: 1 },
    { name: "shopAddressProof", maxCount: 1 },
    { name: "officeAddressProof", maxCount: 1 },
    { name: "directorKycFiles", maxCount: 4 },
    { name: "boardResolution", maxCount: 1 },
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "bankDocument", maxCount: 1 },
  ]),
  multerErrorHandler,
  authenticateToken,
  updateUserDocs
);

router.post("/login", loginController);
router.get("/last-logins", authenticateToken, getLoginHistory);
router.put("/profile", authenticateToken, updateProfileController);
router.get("/profile", authenticateToken, getUserController);
router.get("/user/:id", authenticateToken, getUserId);
router.get(
  "/users",
  authenticateToken,
  authorizeRoles("Admin", "Distributor"),
  getUsersWithFilters
);
router.post("/update-credential", updateCredential);

router.put(
  "/user/:id/status",
  authenticateToken,
  authorizeRoles("Admin"),
  updateUserStatus
);
router.put(
  "/user/:id",
  authenticateToken,
  authorizeRoles("Admin", "Retailer"),
  updateUserDetails
);
router.get(
  "/dashboard",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getDashboardStats
);
router.get(
  "/dashboard/service-usage",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getServiceUsage
);
router.get(
  "/dashboard/payin-payout",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getPayInPayOutReport
);
router.put(
  "/users/:id/permissions",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  updateUserPermissions
);
router.put(
  "/users/updateProgress",
  // authenticateToken,
  // authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  updateProgress
);
router.get(
  "/users/:id/permissions",
  authenticateToken,
  authorizeRoles("Admin", "Distributor", "Retailer", "Sub Admin"),
  getUserPermissions
);

module.exports = router;
