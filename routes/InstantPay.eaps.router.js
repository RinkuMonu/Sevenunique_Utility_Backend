const express = require("express");
const { signupInitiate, signupValidate, mobileChangeInitiate, mobileChangeValidate, getMerchantList, MerchantBiometricKyc, MerchantBiometric } = require("../controllers/InstantPay.aeps.controller");
const router = express.Router();
const bbpsController = require("../controllers/instantpay/bbpsControllerInstant");
const instantpayController = require("../controllers/instantpay/AEPSController");
const authenticateToken = require("../middleware/verifyToken");


// Existing routes
router.post("/signup/initiate", signupInitiate);
router.post("/signup/validate", signupValidate);
router.post("/signup/MerchantBiometric", MerchantBiometric);
router.post("/signup/MerchantBiometricKyc", MerchantBiometricKyc);
router.post("/mobile/update", mobileChangeInitiate);
router.post("/mobile/validate", mobileChangeValidate);
router.post("/list", getMerchantList);
// Circle Lookup
router.post("/circle", bbpsController.circleLookup);

// Plans
router.post("/plans", bbpsController.getPlans);

// Categories
router.get("/categories", bbpsController.getCategories);

// Billers List
router.post("/billers", bbpsController.listBillers);

// Biller Details
router.post("/biller-details", bbpsController.getBillerDetails);

// Pre-Payment Enquiry
router.post("/pre-enquiry", bbpsController.prePaymentEnquiry);

// Payment
router.post("/payment", authenticateToken, bbpsController.makePayment);



// aeps 

// 🔹 Outlet related
router.post("/instantpay/outlet/register", instantpayController.outletRegister);
router.post("/instantpay/outlet/login-status", instantpayController.outletLoginStatus);
router.post("/instantpay/outlet/login", authenticateToken, instantpayController.outletLogin);

// 🔹 AEPS transactions
router.post("/instantpay/withdrawal", authenticateToken, instantpayController.cashWithdrawal);
router.post("/instantpay/balance-enquiry", authenticateToken, instantpayController.balanceEnquiry);
router.post("/instantpay/mini-statement", authenticateToken, instantpayController.miniStatement);
router.post("/instantpay/deposit", authenticateToken, instantpayController.deposite);

// 🔹 Bank list
router.get("/instantpay/bank-list", authenticateToken, instantpayController.getBankList);


module.exports = router;
