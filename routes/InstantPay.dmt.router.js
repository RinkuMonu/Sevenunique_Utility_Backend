const express = require("express");
const { getBankList, registerRemitter, verifyRemitterRegistration, remitterKyc, beneficiaryRegistration, beneficiaryRegistrationVerify, beneficiaryDelete, beneficiaryDeleteVerify, generateTransactionOtp, makeTransaction, getRemitterProfile } = require("../controllers/InstantPay.dmt.controller");
const authenticateToken = require("../middleware/verifyToken");
const router = express.Router();


// Bank list
router.get("/banks", authenticateToken, getBankList);

// Remitter profile
router.post("/remitter-profile", authenticateToken, getRemitterProfile);

// Remitter registration
router.post("/remitter-registration", authenticateToken, registerRemitter);

// Remitter registration verify
router.post("/remitter-registration-verify", authenticateToken, verifyRemitterRegistration);


router.post("/remitterKyc", authenticateToken, remitterKyc);

router.post("/beneficiary/register", authenticateToken, beneficiaryRegistration);
router.post("/beneficiary/verify", authenticateToken, beneficiaryRegistrationVerify);

router.post("/beneficiary/delete", authenticateToken, beneficiaryDelete);
router.post("/beneficiary/delete-verify", authenticateToken, beneficiaryDeleteVerify);

// Generate OTP for transactions
router.post("/generate-otp", authenticateToken, generateTransactionOtp);

router.post("/", authenticateToken, makeTransaction);

module.exports = router;
