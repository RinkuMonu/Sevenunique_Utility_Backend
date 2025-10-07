const express = require("express");
const { getBankList, registerRemitter, verifyRemitterRegistration, remitterKyc, beneficiaryRegistration, beneficiaryRegistrationVerify, beneficiaryDelete, beneficiaryDeleteVerify, generateTransactionOtp, makeTransaction, getRemitterProfile } = require("../controllers/InstantPay.dmt.controller");
const router = express.Router();


// Bank list
router.get("/banks", getBankList);

// Remitter profile
router.post("/remitter-profile", getRemitterProfile);

// Remitter registration
router.post("/remitter-registration", registerRemitter);

// Remitter registration verify
router.post("/remitter-registration-verify", verifyRemitterRegistration);


router.post("/remitterKyc", remitterKyc);

router.post("/beneficiary/register", beneficiaryRegistration);
router.post("/beneficiary/verify", beneficiaryRegistrationVerify);

router.post("/beneficiary/delete", beneficiaryDelete);
router.post("/beneficiary/delete-verify", beneficiaryDeleteVerify);

// Generate OTP for transactions
router.post("/generate-otp", generateTransactionOtp);

router.post("/", makeTransaction);

module.exports = router;
