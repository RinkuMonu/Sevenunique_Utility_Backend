import axios from "axios";
import crypto from "crypto";
import xml2js from "xml2js";
import mongoose from "mongoose";
import userModel from "../models/userModel.js";
import { calculateCommissionFromSlabs, getApplicableServiceCharge } from "../utils/chargeCaluate.js";
import Transaction from "../models/transactionModel.js";
import payOutModel from "../models/payOutModel.js";
import { distributeCommission } from "../utils/distributerCommission.js";
import CommissionTransaction from "../models/CommissionTransaction.js";
import DmtReport from "../models/dmtTransactionModel.js";
const BASE_URL = "https://api.instantpay.in/fi/remit/out/domesticPpi";

const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Client-Id": "YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
        "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
        "X-Ipay-Outlet-Id": '561907 ', // ✅ add this 
        "X-Ipay-Endpoint-Ip": "223.226.127.0",
        "Content-Type": "application/json",
    };
};
const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY

function encrypt(text, key) {
    const encryptionKey = Buffer.from(key); // 32 bytes
    const algorithm = "aes-256-cbc";
    const iv = crypto.randomBytes(16); // 16 bytes IV
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    // IV ko bhi attach kar dete hain (Base64 me safe transfer ke liye)
    const encryptedData = Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
    return encryptedData;
}

async function parsePidXML(pidXml) {
    try {
        const result = await xml2js.parseStringPromise(pidXml, { explicitArray: true });
        const pidData = result?.PidData;
        if (!pidData) throw new Error("Invalid PID XML");

        const resp = pidData.Resp?.[0] || {};
        const deviceInfo = pidData.DeviceInfo?.[0] || {};
        const skey = pidData.Skey?.[0] || {};
        const hmac = pidData.Hmac?.[0] || {};
        const data = pidData.Data?.[0] || {};

        // Extract additional_info Params safely
        let params = {};
        if (deviceInfo.additional_info?.[0]?.Param) {
            deviceInfo.additional_info[0].Param.forEach((p) => {
                if (p.$?.name && p.$?.value) {
                    params[p.$.name] = p.$.value;
                }
            });
        }

        return {
            dc: deviceInfo.$?.dc || "",
            dpId: deviceInfo.$?.dpId || "",
            rdsId: deviceInfo.$?.rdsId || "",
            Skey: skey._ || "", // actual key data
            rdsVer: deviceInfo.$?.rdsVer || "",
            mi: deviceInfo.$?.mi || "",
            mc: deviceInfo.$?.mc || "",
            ci: skey.$?.ci || "", // certificate info
            hmac: hmac || "", // actual HMAC
            pidData: data._ || "",
            srno: params.srno || "",
            ts: params.ts || "",
        };
    } catch (err) {
        throw new Error("Failed to parse PID XML: " + err.message);
    }
}

export const instantpayService = async (endpoint, method = "POST", data = {}) => {
    try {
        const config = {
            method,
            url: `${BASE_URL}/${endpoint}`,
            headers: getHeaders(),
            data,
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`❌ Error in ${endpoint}:`, error.response?.data || error.message);
        throw new Error(error.response?.data?.status || "InstantPay API Error");
    }
};

// 1️⃣ Bank List
export const getBankList = async (req, res) => {
    try {
        const result = await instantpayService("banks");
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2️⃣ Remitter Profile
export const remitterProfile = async (req, res) => {
    try {

        const result = await instantpayService("remitterProfile", "POST", req.body);
        res.json(result);
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: err.message });
    }
};

// 3️⃣ Remitter Registration
export const remitterRegistration = async (req, res) => {
    try {
        const { mobileNumber, encryptedAadhaar, referenceKey, pan, authType = "otp" } = req.body;
        if (!mobileNumber || !encryptedAadhaar || !referenceKey || !pan || !authType) {
            return res.status(400).json({ message: "mobileNumber, encryptedAadhaar, and referenceKey are required" });
        }
        const result = await instantpayService("remitterRegistration", "POST", { mobileNumber, pan, encryptedAadhaar: encrypt(encryptedAadhaar, encryptionKey), referenceKey, authType });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4️⃣ Remitter Registration Verify
export const remitterRegistrationVerify = async (req, res) => {
    try {
        const {
            mobileNumber,
            referenceKey,
            latitude,
            longitude,
            externalRef,
            otp
        } = req.body

        if (!mobileNumber || !latitude || !longitude || !referenceKey || !externalRef || !otp) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const result = await instantpayService("remitterRegistrationVerify", "POST", {
            mobileNumber,
            referenceKey,
            latitude,
            longitude,
            externalRef,
            otp
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5️⃣ Remitter KYC
export const remitterKyc = async (req, res) => {
    try {
        const { pidXml, mobileNumber, latitude, longitude, externalRef, consentTaken = "Y", captureType = "FINGER", referenceKey } = req.body;

        if (!mobileNumber || !referenceKey || !latitude || !longitude || !externalRef || !consentTaken || !captureType || !biometricData) {
            return res.status(400).json({ message: "All fields including biometricData are required" });
        }
        if (!pidXml) {
            return res.status(400).json({ error: "PID XML is required" });
        }

        // 1️⃣ Parse PID XML
        const biometricData = await parsePidXML(pidXml);

        // 2️⃣ Prepare payload
        const payload = {
            mobileNumber,
            latitude,
            longitude,
            externalRef,
            consentTaken,
            captureType,
            biometricData,
            referenceKey
        };


        // 3️⃣ Call InstantPay API
        const result = await instantpayService("remitterKyc", "POST", payload);

        res.json(result);
    } catch (err) {
        console.error("Remitter KYC error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 6️⃣ Beneficiary List
export const beneficiaryList = async (req, res) => {
    try {
        const {
            remitterMobileNumber, referenceKey
        } = req.query

        if (!remitterMobileNumber || !referenceKey) {
            return res.status(400).json({ message: "remitterMobileNumber and referenceKey are required" });
        }

        const result = await instantpayService("beneficiaryList", "GET", { remitterMobileNumber, referenceKey, isSyncMode: true });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7️⃣ Beneficiary Registration
export const beneficiaryRegistration = async (req, res) => {
    try {
        const { remitterMobileNumber, referenceKey, accountNumber, ifsc, bankId, name } = req.body;

        if (!remitterMobileNumber || !referenceKey || !accountNumber || !ifsc || !bankId || !name) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const payload = { remitterMobileNumber, referenceKey, accountNumber, ifsc, bankId, name };
        const result = await instantpayService("beneficiaryRegistration", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 8️⃣ Beneficiary Delete
export const beneficiaryDelete = async (req, res) => {
    try {
        const { remitterMobileNumber, referenceKey, beneficiaryId } = req.body;

        if (!remitterMobileNumber || !referenceKey || !beneficiaryId) {
            return res.status(400).json({ message: "remitterMobileNumber, referenceKey, beneficiaryId are required" });
        }

        const payload = { remitterMobileNumber, referenceKey, beneficiaryId };
        const result = await instantpayService("beneficiaryDelete", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 9️⃣ Beneficiary Delete Verify
export const beneficiaryDeleteVerify = async (req, res) => {
    try {
        const { remitterMobileNumber, referenceKey, otp } = req.body;

        if (!remitterMobileNumber || !referenceKey || !otp) {
            return res.status(400).json({ message: "remitterMobileNumber, referenceKey, otp are required" });
        }

        const payload = { remitterMobileNumber, referenceKey, otp };
        const result = await instantpayService("beneficiaryDeleteVerify", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 🔟 Generate Transaction OTP
export const generateTransactionOtp = async (req, res) => {
    try {
        const { remitterMobileNumber, referenceKey, beneficiaryId, amount } = req.body;

        if (!remitterMobileNumber || !referenceKey || !beneficiaryId || !amount) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const payload = { remitterMobileNumber, referenceKey, beneficiaryId, amount };
        console.log(payload);
        const result = await instantpayService("generateTransactionOtp", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 11️⃣ Transaction
export const makeTransaction = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    // return;
    try {
        const { remitterMobileNumber, accountNumber, ifsc, transferMode, transferAmount, latitude, longitude, referenceKey, otp, externalRef, referenceid, beneficiaryId } = req.body;

        // 1️⃣ Validate required fields
        if (!remitterMobileNumber || !accountNumber || !ifsc || !transferMode || !transferAmount || !latitude || !longitude || !referenceKey || !otp || !externalRef || !referenceid) {
            return res.status(400).json({ status: false, message: "All fields are required." });
        }

        const userId = req.user.id;
        const user = await userModel.findById(userId).session(session);
        if (!user) throw new Error("User not found");

        // 2️⃣ Calculate commission & check wallet balance
        const { commissions, service } = await getApplicableServiceCharge(userId, "DMT Money Transfer");
        const commission = calculateCommissionFromSlabs(transferAmount, commissions || []);
        const usableBalance = user.eWallet - (user.cappingMoney || 0);
        const required = Number((Number(transferAmount) + Number(commission.charge || 0) + Number(commission.gst || 0) + Number(commission.tds || 0)).toFixed(2));

        if (usableBalance < required) {
            return res.status(400).json({
                status: false,
                message: `Insufficient wallet balance. Available: ₹${user.eWallet}, Required: ₹${required + (user.cappingMoney || 0)}`
            });
        }

        // Deduct wallet
        user.eWallet -= required;
        await user.save({ session });

        // 3️⃣ Create debit transaction
        const [debitTxn] = await Transaction.create([{
            user_id: userId,
            transaction_type: "debit",
            type: service._id,
            amount: transferAmount,
            gst: commission.gst,
            tds: commission.tds,
            charge: commission.charge,
            totalDebit: required,
            balance_after: user.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: referenceid,
            description: "DMT PPI Transfer",
            status: "Pending"
        }], { session });

        // 4️⃣ Create payout record
        await new payOutModel({
            userId,
            amount: transferAmount,
            reference: referenceid,
            trans_mode: transferMode,
            type: service._id,
            name: user.name,
            mobile: user.mobileNumber,
            email: user.email,
            status: "Pending",
            charges: commission.charge || 0,
            gst: commission.gst,
            tds: commission.tds,
            totalDebit: required,
            remark: `Money Transfer for beneficiary ID ${beneficiaryId}`
        }).save({ session });


        // 5️⃣ Call InstantPay API
        const payload = { remitterMobileNumber, accountNumber, ifsc, transferMode, transferAmount, latitude, longitude, referenceKey, otp, externalRef };

        const response = await axios.post("https://api.instantpay.in/fi/remit/out/domesticPpi/transaction", payload, { headers: getHeaders() });
        const result = response.data;
        console.log(response.data);
        // console.log(response.data.data.beneficiaryName);

        // 6️⃣ Handle API response
        if (result.statuscode === "TXN") {
            // Success: create DMT report
            await DmtReport.create([{
                user_id: userId,
                status: true,
                type: service._id,
                ackno: result.data.externalRef,
                referenceid: result.data.poolReferenceId,
                utr: result.data.txnReferenceId,
                txn_status: "1",
                benename: result.data.beneficiaryName,
                remarks: result.status,
                message: result.status,
                remitter: result.data.remitterMobile,
                account_number: result.data.beneficiaryAccount,
                gatewayCharges: {
                    bc_share: parseFloat(result.bc_share || 0),
                    txn_amount: parseFloat(result.data.txnValue || transferAmount),
                    customercharge: parseFloat(commission.charge || 0),
                    gst: parseFloat(commission.gst),
                    tds: parseFloat(commission.tds),
                    netcommission: parseFloat(commission.distributor + commission.admin || 0),
                },
                charges: commission.charge,
                commission: { distributor: commission.distributor, admin: commission.admin },
                gst: commission.gst,
                tds: commission.tds,
                amount: transferAmount,
                totalDebit: required,
            }], { session });

            // Update payout & transaction status
            await payOutModel.updateOne({ reference: referenceid }, { $set: { status: "Success" } }, { session });
            await Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Success" } }, { session });

            // Distribute commission
            await distributeCommission({
                user: userId,
                distributer: user.distributorId,
                service,
                transferAmount,
                commission,
                reference: referenceid,
                description: "Commission for DMT PPI Transaction",
                session
            });

            debitTxn.status = "Success";
            await debitTxn.save({ session });

            // Commission transaction record
            await CommissionTransaction.create([{
                referenceId: referenceid,
                service: commissions.service,
                baseAmount: transferAmount,
                charge: commission.charge + commission.gst,
                netAmount: required,
                roles: [
                    { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: commission.charge || 0 },
                    { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
                    { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
                ],
                type: "credit",
                status: "Success",
                sourceRetailerId: userId
            }], { session });

            await session.commitTransaction();
            return res.status(200).json({ status: true, message: "Transaction successful.", data: result });
        } else if (result.statuscode === "TUP") {
            // Success: create DMT report
            await DmtReport.create([{
                user_id: userId,
                status: true,
                type: service._id,
                ackno: result.data.externalRef,
                referenceid: result.data.poolReferenceId,
                utr: result.data.txnReferenceId,
                txn_status: "Pending",
                benename: result.data.beneficiaryName,
                remarks: result.status,
                message: result.status,
                remitter: result.data.remitterMobile,
                account_number: result.data.beneficiaryAccount,
                gatewayCharges: {
                    bc_share: parseFloat(result.bc_share || 0),
                    txn_amount: parseFloat(result.data.txnValue || transferAmount),
                    customercharge: parseFloat(commission.charge || 0),
                    gst: parseFloat(commission.gst),
                    tds: parseFloat(commission.tds),
                    netcommission: parseFloat(commission.distributor + commission.admin || 0),
                },
                charges: commission.charge,
                commission: { distributor: commission.distributor, admin: commission.admin },
                gst: commission.gst,
                tds: commission.tds,
                amount: transferAmount,
                totalDebit: required,
            }], { session });

            // Update payout & transaction status
            await payOutModel.updateOne({ reference: referenceid }, { $set: { status: "Pending" } }, { session });
            await Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Pending" } }, { session });

            // Distribute commission
            // await distributeCommission({
            //     user: userId,
            //     distributer: user.distributorId,
            //     service,
            //     transferAmount,
            //     commission,
            //     reference: referenceid,
            //     description: "Commission for DMT PPI Transaction",
            //     session
            // });

            debitTxn.status = "Pending";
            await debitTxn.save({ session });

            // Commission transaction record
            await CommissionTransaction.create([{
                referenceId: referenceid,
                service: commissions.service,
                baseAmount: transferAmount,
                charge: commission.charge + commission.gst,
                netAmount: required,
                roles: [
                    { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: commission.charge || 0 },
                    { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
                    { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
                ],
                type: "credit",
                status: "Pending",
                sourceRetailerId: userId
            }], { session });

            await session.commitTransaction();
            return res.status(200).json({ status: true, message: "Transaction successful.", data: result });
        }
        else {
            // Failure: rollback
            user.eWallet += required;
            await user.save({ session });
            await Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Failed" } }, { session });
            await payOutModel.updateOne({ reference: referenceid }, { $set: { status: "Failed" } }, { session });
            console.log(result);
            throw new Error(result.status || "Transaction failed at provider");
        }
    } catch (err) {

        await session.abortTransaction();
        console.error("💥 Transaction Error:", err);
        res.status(500).json({ status: false, message: err.message || "Transaction failed", error: err.response?.data || err.message });
    } finally {
        session.endSession();
    }
};

// 12️⃣ Transaction Refund OTP
export const transactionRefundOtp = async (req, res) => {
    try {
        const { ipayId } = req.body;
        if (!ipayId) return res.status(400).json({ message: "ipayId is required" });

        const payload = { ipayId };
        const result = await instantpayService("transactionRefundOtp", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 13️⃣ Transaction Refund
export const transactionRefund = async (req, res) => {
    try {
        const { ipayId, referenceKey, otp } = req.body;

        if (!ipayId || !referenceKey || !otp) {
            return res.status(400).json({ message: "ipayId, referenceKey, otp are required" });
        }

        const payload = { ipayId, referenceKey, otp };
        const result = await instantpayService("transactionRefund", "POST", payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
