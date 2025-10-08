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

const router = express.Router();

// 1️⃣ Bank List
router.post("/banks", getBankList);

// 2️⃣ Remitter APIs
router.post("/remitter-profile", remitterProfile);
router.post("/remitter-registration", remitterRegistration);
router.post("/remitter-registration-verify", remitterRegistrationVerify);
router.post("/remitter-kyc", remitterKyc);

// 3️⃣ Beneficiary APIs
router.get("/beneficiary-list", beneficiaryList);
router.post("/beneficiary-registration", beneficiaryRegistration);
router.post("/beneficiary-delete", beneficiaryDelete);
router.post("/beneficiary-delete-verify", beneficiaryDeleteVerify);

// 4️⃣ Transaction APIs
router.post("/generate-transaction-otp", generateTransactionOtp);
router.post("/transaction", makeTransaction);
router.post("/transaction-refund-otp", transactionRefundOtp);
router.post("/transaction-refund", transactionRefund);

export default router;
