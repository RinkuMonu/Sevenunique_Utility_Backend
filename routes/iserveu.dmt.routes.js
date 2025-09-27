const router = require("express").Router();
const C = require("../controllers/iserveu.dmt.controller");

router.post("/customer", C.getCustomer);
router.post("/otp/send", C.sendOtp);
router.post("/customer/process", C.processCustomer);
router.post("/bene/verify", C.verifyBeneficiary);
router.post("/transfer", C.moneyTransfer);
router.post("/status", C.txnStatusReport);
router.post("/callback", C.callback); // expose to iServeU

module.exports = router;
