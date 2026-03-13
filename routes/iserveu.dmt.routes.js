const router = require("express").Router();
const C = require("../controllers/iserveu.dmt.controller");
const authenticateToken = require("../middleware/verifyToken");

router.post("/customer", authenticateToken, C.getCustomer);
router.post("/otp/send", authenticateToken, C.sendOtp);
router.post("/customer/process", authenticateToken, C.processCustomer);
router.post("/bene/verify", authenticateToken, C.verifyBeneficiary);
router.get("/beneficiaries", authenticateToken, C.getBeneficiary);
router.post("/transfer", authenticateToken, C.moneyTransfer);
router.post("/status", authenticateToken, C.txnStatusReport);
router.post("/callback", C.callback);

module.exports = router;  
