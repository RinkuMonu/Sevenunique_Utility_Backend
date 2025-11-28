const express = require("express");
const {
  getToken,
  aepsCallback,
  matmCallback,
  sendAepsExcelMail,
  updateIsOnBoardStatus,
} = require("../controllers/Iserveu");
const authenticateToken = require("../middleware/verifyToken");
const router = express.Router();

// 🔹 AEPS Routes
router.get("/get-token", getToken);
router.post("/callback", aepsCallback);
router.post("/matm/callback", matmCallback);
router.post("/send-email-log",authenticateToken, sendAepsExcelMail);
router.put("/onboard-status/:userId",authenticateToken, updateIsOnBoardStatus);

module.exports = router;
