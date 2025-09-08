const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/verifyToken.js');
const { queryRemitter, remitterEkyc, registerRemitter, registerBeneficiary, fetchBeneficiary, BeneficiaryById, deleteBeneficiary, PennyDrop, sendTransactionOtp, performTransaction, TrackTransaction, RefundOtp, Refund } = require('../controllers/SprintVerify/dmtController.js');
const { generateOnboardURL, transactionCallback, onboardResponseCallback, checkOnboardStatus, activateMerchant, registerMerchant, authenticateMerchant, balanceEnquiry, withdrawWithAuth, getMiniStatement, getAepsBankList, updateOnboardTransaction } = require('../controllers/SprintVerify/aepsController.js');
const reportController = require('../controllers/reportsController.js');

router.post('/d1/query', authenticateToken, queryRemitter);
router.post('/d1/kyc', authenticateToken, remitterEkyc);
router.post('/d1/register', authenticateToken, registerRemitter);
router.post('/d1/bene/register', authenticateToken, registerBeneficiary);
router.get("/d1/bene", authenticateToken, fetchBeneficiary);
router.delete("/d1/bene", authenticateToken, deleteBeneficiary);
router.get("/d1/bene_id", authenticateToken, BeneficiaryById);

router.post('/d1/pennydrop', authenticateToken, PennyDrop);
router.post('/d1/send-otp', authenticateToken, sendTransactionOtp);
router.post('/d1/perform-transaction', authenticateToken, performTransaction);
router.post('/d1/track-transaction', authenticateToken, TrackTransaction);
router.post('/d1/refund-otp', authenticateToken, RefundOtp);
router.post('/d1/refund', authenticateToken, Refund);

router.post("/aeps/onboarding", authenticateToken, generateOnboardURL)
router.post("/aeps/txn/callback", transactionCallback)
router.get("/aeps/onboard/callback", onboardResponseCallback)
router.post("/aeps/onboard/activate", authenticateToken, activateMerchant)
router.post("/aeps/onboard/status", authenticateToken, checkOnboardStatus)
router.put("/aeps/onboard/update", authenticateToken, updateOnboardTransaction)

router.post("/aeps/register", authenticateToken, registerMerchant)
router.post("/aeps/register/auth", authenticateToken, authenticateMerchant)
router.post("/aeps/balance", authenticateToken, balanceEnquiry)
router.post("/aeps/withdraw", authenticateToken, withdrawWithAuth)
router.post("/aeps/miniStatement", authenticateToken, getMiniStatement)
router.get("/aeps/banklist", authenticateToken, getAepsBankList)

//reports
router.get("/aeps/merchants", authenticateToken, reportController.getAllOnboardTransactions)
router.get('/aeps/merchant/:userId', reportController.getMerchantByUserId);

module.exports = router;
