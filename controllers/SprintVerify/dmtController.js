require("dotenv").config();
const axios = require('axios');
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const { encryptPidData } = require('../../services/jwtService');
const crypto = require('crypto');
const dmtBeneficiary = require('../../models/dmtBeneficiary');
const DmtReport = require('../../models/dmtTransactionModel.js');
const PayOut = require("../../models/payOutModel.js")
const Transaction = require("../../models/transactionModel.js");
const userModel = require("../../models/userModel.js");
const mongoose = require('mongoose');
const getDmtOrAepsMeta = require('../../utils/aeps&DmtCommmsion.js');
const { calculateCommissionFromSlabs, getApplicableServiceCharge, logApiCall } = require('../../utils/chargeCaluate.js');
const { distributeCommission } = require('../../utils/distributerCommission.js');
const commissionModel = require('../../models/commissionModel.js');
const getCommissionPackage = require('../../utils/aeps&DmtCommmsion.js');
const CommissionTransaction = require('../../models/CommissionTransaction.js');

// const headers = {
//     'Token': generatePaysprintJWT(),
//  Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_p

// }
function getPaysprintHeaders() {
    return {
        'Token': generatePaysprintJWT(),
        Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_P
    };
}

exports.queryRemitter = async (req, res, next) => {

    try {
        const headers = getPaysprintHeaders();
        console.log(headers)
        const { mobile, lat, long } = req.body;
        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/queryremitter',
            { mobile: Number(mobile), lat, long },
            { headers }
        );
        logApiCall({
            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/queryremitter",
            requestData: req.body,
            responseData: response.data
        });
        return res.status(200).json(response.data);

    } catch (error) {
        console.error("error", error);
        return next(error)
    }
};

exports.remitterEkyc = async (req, res, next) => {
    console.log(getPaysprintHeaders());
    try {
        const headers = getPaysprintHeaders();
        const {
            mobile,
            lat,
            long,
            aadhaar_number,
            piddata,
            accessmode = "WEB",
            is_iris = 2,
        } = req.body;

        // PIDDATA preview (first 200 chars)
        console.log("📄 PIDDATA (raw, first 200 chars):", piddata);

        const key = "655b0df386201f81";
        const iv = "613796a12c285275";

        const encryptedData = encryptPidData(`${piddata}`, key, iv);
        console.log("🔒 Encrypted sample (first 80 chars):", encryptedData);

        const finalBody = {
            mobile: Number(mobile),
            lat,
            long,
            aadhaar_number,
            data: encryptedData,
            accessmode,
            is_iris,
        };

        console.log("📤 Final API Request Body (preview):", {
            ...finalBody,
            data: encryptedData.slice(0, 60) + "...",
        });

        const response = await axios.post(
            "https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/queryremitter/kyc",
            finalBody,
            { headers }
        );

        console.log("✅ Paysprint Response:", response.data);

        logApiCall({
            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/queryremitter/kyc",
            requestData: finalBody,
            responseData: response.data,
        });

        return res.status(200).json({ ...response.data });
    } catch (error) {
        console.error("❌ EKYC API Error:", error.response?.data || error.message);
        return next(error);
    }
};

exports.registerRemitter = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const { mobile, otp, stateresp, ekyc_id } = req.body;

        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/registerremitter',
            {
                "mobile": Number(mobile),
                "otp": otp,
                "stateresp": stateresp,
                "ekyc_id": ekyc_id
            },
            { headers }
        );
        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/remitter/registerremitter",
            requestData: req.body,
            responseData: response.data
        });
        return res.status(200).json({ ...response.data });

    } catch (error) {
        return next(error)
    }
};

exports.registerBeneficiary = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const {
            mobile,
            benename,
            bankid,
            accno,
            ifsccode,
            verified,
            gst_state,
            dob,
            address,
            pincode
        } = req.body;
        const payload = {
            mobile,
            benename,
            bankid,
            accno,
            ifsccode,
            verified,
            ...(gst_state && { gst_state }),
            ...(dob && { dob }),
            ...(address && { address }),
            ...(pincode && { pincode })
        };
        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary',
            payload,
            { headers }
        );
        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary",
            requestData: req.body,
            responseData: response.data
        });
        if (response.data?.response_code === 1) {
            const newBeneficiary = new dmtBeneficiary({
                user_id: req.user.id,
                mobile,
                benename,
                bankid,
                accno,
                ifsccode,
                address,
                pincode,
                type: "Dmt Beneficiary"
            });
            await newBeneficiary.save();
        }
        return res.json({ ...response.data });
    } catch (error) {
        return next(error)
    }
};

exports.deleteBeneficiary = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const { mobile, bene_id } = req.body;
        if (!mobile || !bene_id) {
            return res.status(400).json({ error: true, message: "mobile and bene_id are required" });
        }
        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/deletebeneficiary',
            {
                mobile,
                bene_id
            },
            { headers }
        );
        logApiCall({
            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/deletebeneficiary",

            requestData: req.body,
            responseData: response.data
        });
        return res.json({ ...response.data });
    } catch (error) {
        return next(error)
    }
};

exports.fetchBeneficiary = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const { mobile } = req.query;
        if (!mobile) {
            return res.status(400).json({ error: true, message: "mobile is required" });
        }
        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/fetchbeneficiary',
            { mobile }, { headers }
        );
        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/fetchbeneficiary",
            requestData: req.query,
            responseData: response.data
        });
        return res.json({ ...response.data });

    } catch (error) {
        return next(error)
    }
};

exports.BeneficiaryById = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const { mobile, beneid } = req.query;

        if (!mobile) {
            return res.status(400).json({ error: true, message: "mobile is required" });
        }

        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/fetchbeneficiarybybeneid',
            { mobile, beneid }, { headers }
        );

        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/fetchbeneficiarybybeneid",
            requestData: req.query,
            responseData: response.data
        });

        return res.json({ ...response.data });

    } catch (error) {
        return next(error)
    }
};

exports.PennyDrop = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const headers = getPaysprintHeaders();
        const {
            mobile,
            accno,
            bankid,
            benename,
            referenceid,
            pincode,
            address,
            dob,
            gst_state,
            bene_id,
            category
        } = req.body;

        const commissionPackage = await getDmtOrAepsMeta(req.user.id, category);
        console.log("commissionPackage", commissionPackage);


        const amount = commissionPackage?.dmtPennyDrop || 0;
        const userId = req.user.id;

        const missingFields = [];
        if (!mobile) missingFields.push("mobile");
        if (!accno) missingFields.push("accno");
        if (!benename) missingFields.push("benename");
        if (!referenceid) missingFields.push("referenceid");
        if (missingFields.length > 0) {
            return res.status(400).json({ error: true, message: `Missing fields: ${missingFields.join(", ")}` });
        }

        const user = await userModel.findById(userId).session(session);
        if (!user || user.eWallet < amount) {
            throw new Error("Insufficient wallet balance");
        }

        user.eWallet -= amount;
        await user.save({ session });

        const [debitTxn] = await Transaction.create([{
            user_id: userId,
            transaction_type: "debit",
            type: commissionPackage.service,
            amount,
            balance_after: user.eWallet,
            totalDebit: amount,
            payment_mode: "wallet",
            transaction_reference_id: referenceid,
            description: "Penny Drop Verification for DMT",
            status: "Pending"
        }], { session });

        await PayOut.create([{
            userId,
            amount,
            type: commissionPackage.service,
            reference: referenceid,
            trans_mode: "IMPS",
            name: benename,
            mobile,
            email: user.email,
            status: "Pending",
            charges: 0,
            totalDebit: amount,
            remark: `Penny Drop verification for ${accno} for DMT`
        }], { session });

        // ✅ API call
        const payload = {
            mobile,
            accno,
            bankid,
            benename,
            referenceid,
            pincode,
            address,
            dob,
            gst_state,
            bene_id
        };

        const { data: result } = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/benenameverify',
            payload,
            { headers }
        );

        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/beneficiary/registerbeneficiary/benenameverify",
            requestData: req.body,
            responseData: result
        });

        if (result.status === true && result.response_code == 1) {
            await DmtReport.create([{
                user_id: userId,
                status: "Success",
                type: commissionPackage.service,
                ackno: result.ackno || "",
                referenceid: result.referenceid || referenceid,
                utr: result.utr || "",
                txn_status: 1,
                benename: result.beneficiary_name || benename,
                remarks: result.message || "Verified",
                message: result.message || "",
                remitter: mobile,
                account_number: accno,
                gatewayCharges: {
                    bc_share: 0,
                    txn_amount: amount,
                    customercharge: 0,
                    gst: 0,
                    tds: 0,
                    netcommission: 0,
                },
                totalDebit: amount,
                NPCI_response_code: result.response_code,
                bank_status: result.message || "",
                provider: "paySprint"
            }], { session });

            await Promise.all([
                PayOut.updateOne({ reference: referenceid }, { $set: { status: "Success" } }).session(session),
                Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Success" } }).session(session)
            ]);

            debitTxn.status = "Success";
            await debitTxn.save({ session });

        } else {
            user.eWallet += amount;
            await user.save({ session });

            await Promise.all([
                Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Failed" } }).session(session),
                PayOut.updateOne({ reference: referenceid }, { $set: { status: "Failed" } }).session(session)
            ]);

            throw new Error(result.message || "Penny Drop failed");
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Penny drop verification completed",
            data: result
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return next(error);
    }
};

exports.sendTransactionOtp = async (req, res, next) => {
    try {
        const headers = getPaysprintHeaders();
        const {
            mobile,
            referenceid,
            bene_id,
            txntype,
            amount,
            pincode = "110015",
            address = "New Delhi",
            dob = "01-01-1990",
            gst_state = "07",
            lat = "28.786543",
            long = "78.345678"
        } = req.body;

        if (!mobile || !referenceid || !bene_id || !amount) {
            return res.status(400).json({ error: true, message: "Missing required fields" });
        }

        const payload = {
            mobile,
            referenceid,
            bene_id,
            txntype,
            amount,
            pincode,
            address,
            dob,
            gst_state,
            lat,
            long
        };

        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact/send_otp',
            payload, { headers }
        );
        logApiCall({

            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact/send_otp",
            requestData: req.body,
            responseData: response.data
        });
        return res.json(response.data);
    } catch (error) {
        return next(error)
    }
};

exports.performTransaction = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const headers = getPaysprintHeaders();
        const {
            mobile,
            referenceid,
            bene_id,
            txntype,
            amount,
            otp,
            stateresp,
            pincode = "110015",
            address = "New Delhi",
            dob = "01-01-1990",
            gst_state = "07",
            lat = "28.786543",
            long = "78.345678",
            category
        } = req.body;


        const missingFields = [];
        if (!mobile) missingFields.push('mobile');
        if (!referenceid) missingFields.push('referenceid');
        if (!bene_id) missingFields.push('bene_id');
        if (!txntype) missingFields.push('txntype');
        if (!amount) missingFields.push('amount');
        if (!otp) missingFields.push('otp');
        if (!stateresp) missingFields.push('stateresp');

        if (missingFields.length > 0) {
            return res.status(400).json({ error: true, message: `Missing required fields: ${missingFields.join(', ')}` });
        }
        let userId = req.user.id;
        const { commissions, service } = await getApplicableServiceCharge(userId, category);

        let commission = calculateCommissionFromSlabs(amount, commissions)
        console.log(commission);


        const user = await userModel.findById(userId).session(session);
        if (!user) {
            return res.status(404).json({ error: true, message: "User not found" });
        }
        const usableBalance = user.eWallet - (user.cappingMoney || 0);
        const required = Number((
            Number(amount) +
            Number(commission.charge || 0) +
            Number(commission.gst || 0) + Number(commission.tds || 0) - Number(commission.retailer || 0)
        ).toFixed(2));

        if (usableBalance < required) {
            return res.status(400).json({
                error: true,
                message: `Insufficient wallet balance. You must maintain ₹${user.cappingMoney} in your wallet. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`
            });

        }


        const updatedUser = await userModel.findOneAndUpdate(
            {
                _id: userId,
                eWallet: { $gte: required + (user.cappingMoney || 0) }
            },
            {
                $inc: { eWallet: -required }
            },
            { new: true, session }
        );

        if (!updatedUser) {
            return res.status(400).json({
                status: false,
                message: `Insufficient wallet balance. Need ₹${required}`
            });
        }

        const [debitTxn] = await Transaction.create([{
            user_id: userId,
            transaction_type: "debit",
            type: service._id,
            amount: Number(amount),
            gst: Number(commission.gst),
            tds: Number(commission.tds),
            charge: Number(commission.charge),
            totalDebit: Number(required),
            totalCredit: Number(commission.retailer || 0),
            balance_after: updatedUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: referenceid,
            description: "DMT Transfer",
            status: "Pending"
        }], { session });

        await PayOut.create([{
            userId,
            amount: Number(amount),
            type: service._id,
            reference: referenceid,
            trans_mode: txntype,
            name: user.name,
            mobile: user.mobileNumber,
            email: user.email,
            status: "Pending",
            charges: commission.charge || 0,
            gst: commission.gst || 0,
            tds: commission.tds || 0,
            totalDebit: required,
            remark: `Money Transfer for beneficiary ID ${bene_id}`
        }], { session });

        const payload = {
            mobile, referenceid, bene_id, txntype, amount,
            otp, stateresp, pincode, address, dob,
            gst_state, lat, long
        };

        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact',
            payload,
            { headers }
        );
        logApiCall({
            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact",

            requestData: req.body,
            responseData: response.data
        });

        const result = response?.data || {};

        // ✅ Step 6: Handle Response from API
        if (result.status === true && result.txn_status === 1) {
            await DmtReport.create([{
                user_id: userId,
                type: service._id,
                status: "Success",
                ackno: result.ackno,
                referenceid: result.referenceid,
                utr: result.utr,
                txn_status: result.txn_status,
                benename: result.benename,
                remarks: result.remarks,
                message: result.message,
                remitter: result.remitter,
                account_number: result.account_number,
                gatewayCharges: {
                    bc_share: parseFloat(result.bc_share || 0),
                    txn_amount: parseFloat(result.txn_amount || amount),
                    customercharge: parseFloat(result.customercharge || 0),
                    gst: parseFloat(result.gst || 0),
                    tds: parseFloat(result.tds || 0),
                    netcommission: parseFloat(result.netcommission || 0),
                },
                charges: commission.charge,
                commission: {
                    distributor: commission.distributor,
                    admin: commission.admin
                },
                gst: commission.gst,
                tds: commission.tds,
                amount: amount,
                totalDebit: required,
                NPCI_response_code: result.NPCI_response_code || '',
                bank_status: result.bank_status || '',
                provider: "paySprint"
            }], { session });


            await PayOut.updateOne({ reference: referenceid }, { $set: { status: "Success" } }, { session }),
                await Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Success" } }, { session }),
                await distributeCommission({
                    user: userId,
                    distributer: user.distributorId,
                    service: service,
                    amount,
                    commission,
                    reference: referenceid,
                    description: "Commission for DMT Transaction",
                    session
                })


            debitTxn.status = "Success";
            await debitTxn.save({ session });

            await CommissionTransaction.create([{
                referenceId: referenceid,
                service: service._id,
                baseAmount: Number(amount),
                charge: Number(commission.charge) + Number(commission.gst) + Number(commission.tds),
                netAmount: required,
                roles: [
                    {
                        userId,
                        role: "Retailer",
                        commission: commission.retailer || 0,
                        chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
                    },
                    { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
                    { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
                ],
                type: "credit",
                status: "Success",
                sourceRetailerId: userId,
            }], { session });

            console.log("💸 CommissionTransaction created for all roles");


        } else {
            await userModel.updateOne(
                { _id: userId },
                { $inc: { eWallet: required } },
                { session }
            );


            await Promise.all([
                Transaction.updateOne({ transaction_reference_id: referenceid }, { $set: { status: "Failed" } }, { session }),
                PayOut.updateOne({ reference: referenceid }, { $set: { status: "Failed" } }, { session })
            ]);

            throw new Error(result.message || result.remarks || "Transaction failed at provider");
        }

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json(result);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return next(error)
    }
};

// exports.TrackTransaction = async (req, res, next) => {
//     try {
//         const headers = getPaysprintHeaders();
//         const {
//             referenceid,
//         } = req.body;

//         if (!referenceid) {
//             return res.status(400).json({ error: true, message: "Missing required fields" });
//         }
//         const payload = {
//             referenceid,
//         };
//         const response = await axios.post(
//             'https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact/querytransact',
//             payload, { headers }
//         );
//         logApiCall({

//             url: "https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact/querytransact",
//             requestData: req.body,
//             responseData: response.data
//         });
//         return res.json(response.data);
//     } catch (error) {
//         return next(error)
//     }
// };




// exports.RefundOtp = async (req, res, next) => {
//     try {
//         const { referenceid, ackno } = req.body;
//         if (!referenceid || !ackno) {
//             return res.status(400).json({ error: true, message: "Missing required fields" });
//         }
//         const transaction = await Transaction.findOne(
//             { transaction_reference_id: referenceid },
//         );

//         console.log("ttt", transaction)

//         if (!transaction) {
//             return res.status(404).json({
//                 error: true,
//                 message: "Your Transaction not found"
//             });
//         }
//         const beforeStatus = await TrackTransaction(referenceid)


//         const headers = getPaysprintHeaders();
//         const payload = {
//             referenceid,
//             ackno
//         };
//         const response = await axios.post(
//             'https://api.paysprint.in/api/v1/service/dmt/kyc/refund/refund/resendotp',
//             payload, { headers }
//         );
//         logApiCall({
//             url: "https://api.paysprint.in/api/v1/service/dmt/kyc/refund/refund/resendotp",
//             requestData: req.body,
//             responseData: response.data
//         });
//         console.log("xxxxxxxxxxxxxxxxx", response)
//         return res.json(response.data);
//     } catch (error) {

//         console.log("yyyyyyyyyy", error.response?.data)
//         // return next(error)
//         return res.json(error.response?.data)
//     }
// };



exports.trackTransactionStatus = async (referenceid) => {
    if (!referenceid) {
        throw new Error("referenceid is required");
    }

    const headers = getPaysprintHeaders();

    const payload = { referenceid };

    const response = await axios.post(
        "https://api.paysprint.in/api/v1/service/dmt/kyc/transact/transact/querytransact",
        payload,
        { headers }
    );

    logApiCall({
        url: "querytransact",
        requestData: payload,
        responseData: response.data,
    });

    return response.data;
};

exports.RefundOtp = async (req, res, next) => {
    try {
        const { referenceid, ackno } = req.body;

        if (!referenceid || !ackno) {
            return res.status(400).json({
                error: true,
                message: "referenceid and ackno are required",
            });
        }

        // 🔍 Local transaction check
        const DmtReportt = await DmtReport.findOne({
            referenceid: referenceid,
        });

        if (["Success", "Refunded"].includes(DmtReportt.status)) {
            return res.status(400).json({
                error: true,
                message: `Refund OTP not allowed. Transaction already ${DmtReportt.status}`,
            });
        }

        const tranReportt = await Transaction.findOne({
            transaction_reference_id: referenceid,
        });
        const payoutReportt = await PayOut.findOne({
            reference: referenceid,
        });

        if (!DmtReportt || !tranReportt || !payoutReportt) {
            return res.status(404).json({
                error: true,
                message: "Some Report not found",
            });
        }

        console.log("txnnnnnnnnnnn", DmtReportt)

        // STEP 1: Track DmtReport from Paysprint
        const trackRes = await trackTransactionStatus(referenceid);
        console.log("trackRes", trackRes)

        const txnCode = trackRes?.response_code;
        console.log("texnstatus", txnCode)

        // If already success → refund not allowed
        if (txnCode === 1) {
            return res.status(400).json({
                error: true,
                message: "Transaction already successful. Refund not allowed.",
            });
        }

        //  STEP 2: Send Refund OTP
        const headers = getPaysprintHeaders();

        const payload = { referenceid, ackno };

        const response = await axios.post(
            "https://api.paysprint.in/api/v1/service/dmt/kyc/refund/refund/resendotp",
            payload,
            { headers }
        );

        logApiCall({
            url: "refund-resend-otp",
            requestData: payload,
            responseData: response.data,
        });

        return res.json({
            status: true,
            message: response.data?.message || "Refund OTP sent",
            data: response.data,
        });

    } catch (error) {
        console.error("RefundOtp error:", error.response?.data || error.message);
        return res.status(500).json({
            error: true,
            message: error.response?.data?.message || error.message,
        });
    }
};




exports.Refund = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const headers = getPaysprintHeaders();
        const {
            referenceid,
            ackno, otp
        } = req.body;


        if (!referenceid || !ackno || !otp) {
            return res.status(400).json({ error: true, message: "Missing required fields" });
        }
        // 1️⃣ Find transaction & report (Recharge / DMT / etc)
        const transaction = await Transaction.findOne(
            { transaction_reference_id: referenceid },
            null,
            { session }
        );

        if (!transaction) {
            await session.abortTransaction();
            return res.status(404).json({
                error: true,
                message: "Your Transaction not found"
            });
        }

        // 🔐 Double refund protection
        if (transaction.status == "Refunded") {
            await session.commitTransaction();
            return res.json({
                status: true,
                message: "Amount already refunded",
            });
        }
        const payload = { referenceid, ackno, otp };
        const response = await axios.post(
            'https://api.paysprint.in/api/v1/service/dmt/kyc/refund/refund',
            payload, { headers }
        );
        logApiCall({
            url: "https://api.paysprint.in/api/v1/service/dmt/kyc/refund/refund",
            requestData: req.body,
            responseData: response.data
        });
        const apiRes = response.data;

        // ❌ Refund failed at gateway
        if (apiRes.responseCode !== 1) {
            await session.abortTransaction();
            return res.status(400).json({
                error: true,
                message: apiRes.message || "Refund failed at gateway",
                data: apiRes
            });
        }

        // 3️⃣ Wallet credit (ONLY ON SUCCESS)
        const user = await userModel.findByIdAndUpdate(
            transaction.user_id,
            { $inc: { eWallet: transaction.totalDebit } },
            { new: true, session }
        );

        // 4️⃣ Update transaction (same record)
        transaction.status = "Refunded";
        transaction.balance_after = user.eWallet;
        transaction.refunded = true;
        await transaction.save({ session });


        // 5️⃣ Update service report (Recharge / DMT etc)
        await DmtReport.updateOne(
            { referenceid: referenceid },
            {
                $set: {
                    status: "Refunded",
                }
            },
            { session }
        );

        await session.commitTransaction();


        return res.json({
            status: true,
            message: "Refund successful. Amount credited to wallet.",
            walletBalance: user.eWallet,
            data: apiRes
        });

    } catch (error) {
        await session.abortTransaction();
        return next(error);
    } finally {
        session.endSession();
    }
};