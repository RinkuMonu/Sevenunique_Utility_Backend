const express = require("express");
const {
  getToken,
  aepsCallback,
  matmCallback,
  sendAepsExcelMail,
  updateIsOnBoardStatus,
  getMatmReports,
  storeOnboardingData,
  sendBatchOnboardingMail,
  getOnboardingList,
  updateOnboardMailStatus,
} = require("../controllers/Iserveu");
const authenticateToken = require("../middleware/verifyToken");
const router = express.Router();

// 🔹 AEPS Routes
router.get("/get-token", getToken);
router.post("/callback", aepsCallback);
router.get("/matm-report", authenticateToken, getMatmReports);
router.post("/matm/callback", matmCallback);

router.get("/admin/onboarding-list", authenticateToken, getOnboardingList);
router.patch("/admin/onboarding/update-status/:id", authenticateToken, updateOnboardMailStatus);
router.post("/send-email-log", authenticateToken, storeOnboardingData);
router.post("/send-email-log-to-onboard", authenticateToken, sendBatchOnboardingMail);
router.put("/onboard-status/:userId", authenticateToken, updateIsOnBoardStatus);

module.exports = router;
