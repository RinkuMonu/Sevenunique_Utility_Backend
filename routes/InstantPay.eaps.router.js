const express = require("express");
const { signupInitiate, signupValidate, mobileChangeInitiate, mobileChangeValidate, getMerchantList } = require("../controllers/InstantPay.aeps.controller");
const router = express.Router();


// Existing routes
router.post("/signup/initiate", signupInitiate);
router.post("/signup/validate", signupValidate);
router.post("/mobile/update", mobileChangeInitiate);
router.post("/mobile/validate", mobileChangeValidate);
router.post("/list", getMerchantList);

module.exports = router;
