// routes/instantpayPpiRoutes.js
import express from "express";
import {
    getBankList,
    remitterProfile,
    remitterRegistration,
    remitterRegistrationVerify,
    remitterKyc,
    beneficiaryList,
    beneficiaryRegistration,
    beneficiaryDelete,
    beneficiaryDeleteVerify,
    generateTransactionOtp,
    makeTransaction,
    transactionRefundOtp,
    transactionRefund,
} from "../controllers/instantpayPpiController.js";
import authenticateToken from "../middleware/verifyToken.js";

const router = express.Router();

// 1️⃣ Bank List
router.post("/banks",authenticateToken, getBankList);

// 2️⃣ Remitter APIs
router.post("/remitter-profile",authenticateToken, remitterProfile);
router.post("/remitter-registration",authenticateToken, remitterRegistration);
router.post("/remitter-registration-verify",authenticateToken, remitterRegistrationVerify);
router.post("/remitter-kyc",authenticateToken, remitterKyc);

// 3️⃣ Beneficiary APIs
router.get("/beneficiary-list",authenticateToken, beneficiaryList);
router.post("/beneficiary-registration",authenticateToken, beneficiaryRegistration);
router.post("/beneficiary-delete",authenticateToken, beneficiaryDelete);
router.post("/beneficiary-delete-verify",authenticateToken, beneficiaryDeleteVerify);

// 4️⃣ Transaction APIs
router.post("/generate-transaction-otp",authenticateToken, generateTransactionOtp);
router.post("/transaction",authenticateToken, makeTransaction);
router.post("/transaction-refund-otp",authenticateToken, transactionRefundOtp);
router.post("/transaction-refund",authenticateToken, transactionRefund);

export default router;
