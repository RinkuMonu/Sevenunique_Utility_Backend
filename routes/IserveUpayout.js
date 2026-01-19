const router = require("express").Router();
const Payout = require("../controllers/payoutIserveUController");
const authorizeRoles = require("../middleware/verifyRole");
const authenticateToken = require("../middleware/verifyToken");

router.post("/transfer", authenticateToken, Payout.initiatePayout);   // Retailer initiates payout
router.post("/status", Payout.checkStatus);       // Check transaction status
router.get("/callback", Payout.payoutCallback);  // ISU callback
router.post("/request", authenticateToken, Payout.createWithdrawRequest);  // ISU callback
router.get("/admin", authenticateToken, Payout.getAllWithdrawRequests);  // ISU callback
router.post("/admin/:id", authenticateToken, authorizeRoles("Admin"), Payout.updateWithdrawStatus);  // ISU callback

module.exports = router;
