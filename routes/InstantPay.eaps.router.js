const express = require("express");
const { signupInitiate, signupValidate, mobileChangeInitiate, mobileChangeValidate, getMerchantList } = require("../controllers/InstantPay.aeps.controller");
const router = express.Router();
const bbpsController = require("../controllers/instantpay/bbpsControllerInstant");
const instantpayController = require("../controllers/instantpay/AEPSController");


// Existing routes
router.post("/signup/initiate", signupInitiate);
router.post("/signup/validate", signupValidate);
router.post("/mobile/update", mobileChangeInitiate);
router.post("/mobile/validate", mobileChangeValidate);
router.post("/list", getMerchantList);
// Circle Lookup
router.post("/circle", bbpsController.circleLookup);

// Plans
router.get("/plans", bbpsController.getPlans);

// Categories
router.get("/categories", bbpsController.getCategories);

// Billers List
router.post("/billers", bbpsController.listBillers);

// Biller Details
router.post("/biller-details", bbpsController.getBillerDetails);

// Pre-Payment Enquiry
router.post("/pre-enquiry", bbpsController.prePaymentEnquiry);

// Payment
router.post("/payment", bbpsController.makePayment);



// aeps 

// 🔹 Outlet related
router.post("/instantpay/outlet/register", instantpayController.outletRegister);
router.post("/instantpay/outlet/login-status", instantpayController.outletLoginStatus);
router.post("/instantpay/outlet/login", instantpayController.outletLogin);

// 🔹 AEPS transactions
router.post("/instantpay/withdrawal", instantpayController.cashWithdrawal);
router.post("/instantpay/balance-enquiry", instantpayController.balanceEnquiry);
router.post("/instantpay/mini-statement", instantpayController.miniStatement);

// 🔹 Bank list
router.get("/instantpay/bank-list", instantpayController.getBankList);


module.exports = router;
