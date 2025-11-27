const express = require("express");
const {
  getToken,
  aepsCallback,
  matmCallback,
  sendAepsExcelMail,
} = require("../controllers/Iserveu");
const authenticateToken = require("../middleware/verifyToken");
const router = express.Router();

// 🔹 AEPS Routes
router.get("/get-token", authenticateToken, getToken);
router.post("/callback", authenticateToken, aepsCallback);
router.post("/matm/callback", authenticateToken, matmCallback);
router.post("/send-email-log", sendAepsExcelMail);

module.exports = router;
