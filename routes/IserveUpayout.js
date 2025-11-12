const router = require("express").Router();
const Payout = require("../controllers/payoutIserveUController");
const authenticateToken = require("../middleware/verifyToken");

router.post("/transfer", authenticateToken, Payout.initiatePayout);   // Retailer initiates payout
router.post("/status", Payout.checkStatus);       // Check transaction status
router.post("/callback", Payout.payoutCallback);  // ISU callback

module.exports = router;
