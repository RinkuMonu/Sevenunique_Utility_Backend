const router = require("express").Router();
const InstantPay_payout = require("../controllers/instantpay/Payout");
const authenticateToken = require("../middleware/verifyToken");

router.get("/banks", new InstantPay_payout().bankList);
router.post("/transfer", authenticateToken, new InstantPay_payout().transfer);

module.exports = router;
