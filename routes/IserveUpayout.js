const router = require("express").Router();
const Payout = require("../controllers/payoutIserveUController");

router.post("/transfer", Payout.initiatePayout);   // Retailer initiates payout
router.post("/status", Payout.checkStatus);       // Check transaction status
router.post("/callback", Payout.payoutCallback);  // ISU callback

module.exports = router;
