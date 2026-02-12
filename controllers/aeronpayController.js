const { default: axios } = require("axios");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../utils/chargeCaluate");
const payOutModel = require("../models/payOutModel");
const Transaction = require("../models/transactionModel");
const userModel = require("../models/userModel");

const aeronpayHeader = {
    "client_id": process.env.Client_ID,
    "client_secret": process.env.Client_Secret,
    "Content-Type": "application/json"
}


exports.bankFetch = async (req, res) => {
    try {
        console.log(aeronpayHeader)
        const aeronpayRes = await axios.post("https://api.aeronpay.in/api/serviceapi-prod/api/payout/bankid_list", {
            "category": "bankids"
        }, { headers: aeronpayHeader })
        console.log(aeronpayRes);
        res.send({
            status: true,
            msg: "Bank list",
            data: aeronpayRes.data
        })

    } catch (error) {
        res.send({
            status: false,
            massage: error
        })
    }

}
exports.transfer = async (req, res) => {
    const session = await mongoose.startSession();
    let isCommitted = false;

    try {
        session.startTransaction();

        const { amount, mpin, beneAccountNo, beneifsc, longitude, latitude, paramA, custMobNo, custName, paramB } = req.body;
        const category = "69280136fa5562e190cdf90f";
        const userId = req.user.id;
        const requiredField = ["amount", "mpin", "beneAccountNo", "beneifsc", "latitude", "longitude", "custMobNo", "paramA", "custName", "paramB"];

        for (const field of requiredField) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`
                });
            }
        }

        if (Number(amount) < 100) {
            return res.status(400).json({
                success: false,
                message: "Minimum withdrawal amount is ₹100",
            });
        }

        const referenceId = `WD${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

        const user = await userModel.findOne({ _id: userId, status: true }).session(session);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found or inactive" });
        }

        if (user.mpin != mpin) {
            return res.status(401).json({ success: false, message: "Invalid MPIN" });
        }

        const { commissions, service } = await getApplicableServiceCharge(userId, category);

        const commission = commissions?.slabs?.length
            ? calculateCommissionFromSlabs(amount, commissions)
            : { charge: 0, gst: 0, tds: 0, retailer: 0 };

        const usableBalance = Number(user.eWallet) - Number(user.cappingMoney || 0);

        const required = Number(
            (
                Number(amount) +
                Number(commission.charge) +
                Number(commission.gst) +
                Number(commission.tds) -
                Number(commission.retailer)
            ).toFixed(2)
        );

        if (usableBalance < required) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Required ₹${required}`,
            });
        }

        let updatedUser = await userModel.findOneAndUpdate(
            { _id: userId, eWallet: { $gte: required } },
            { $inc: { eWallet: -required } },
            { new: true, session }
        );

        if (!updatedUser) {
            throw new Error("Wallet deduction failed");
        }

        await payOutModel.create(
            [{
                userId,
                amount,
                reference: referenceId,
                type: service?._id,
                trans_mode: "IMPS",
                name: updatedUser.name,
                mobile: updatedUser.mobileNumber,
                email: updatedUser.email,
                status: "Pending",
                account: beneAccountNo,
                ifsc: beneifsc,
                remark: "Cash Withdraw to bank",
                charges: commission.charge,
                gst: commission.gst,
                tds: commission.tds,
                totalDebit: required,
            }],
            { session }
        );

        await Transaction.create(
            [{
                user_id: userId,
                transaction_type: "debit",
                amount,
                type: service?._id || category,
                gst: commission.gst,
                tds: commission.tds,
                charge: commission.charge,
                totalDebit: required,
                totalCredit: commission.retailer,
                balance_after: updatedUser.eWallet,
                payment_mode: "wallet",
                transaction_reference_id: referenceId,
                description: `Cash Withdraw`,
                status: "Pending",
            }],
            { session }
        );

        await session.commitTransaction();
        isCommitted = true;
        session.endSession();

        const payload = {
            bankProfileId: "1",
            accountNumber: "71603718317",
            latitude,
            longitude,
            amount,
            client_referenceId: referenceId,
            transferMode: "imps",
            remarks: "Cash Withdraw to bank",
            beneDetails: {
                bankAccount: beneAccountNo,
                ifsc: beneifsc,
                name: custName,
                email: paramA,
                phone: custMobNo,
                address1: paramB
            }
        };


        const aeronpayRes = await axios.post(
            "https://api.sevenunique.com/aeronpay/transfer",
            payload
        );
        console.log("aeronpayRes", aeronpayRes.data)
        return res.status(200).json({
            success: true,
            message: "Transfer initiated successfully",
            referenceId,
            data: aeronpayRes.data
        });

    } catch (error) {
        console.log(error)
        if (!isCommitted) {
            await session.abortTransaction();
            session.endSession();
        }

        return res.status(500).json({
            success: false,
            message: "Transfer failed",
            error: error.response?.data,
        });
    }
};
exports.transfer1 = async (req, res) => {
    const session = await mongoose.startSession();
    let isCommitted = false;

    try {
        session.startTransaction();

        const { amount, beneAccountNo, beneifsc, referenceId } = req.body;


        const category = "69280136fa5562e190cdf90f";
        const userId = req.user.id;
        const requiredField = ["amount", "beneAccountNo", "beneifsc", "referenceId"];

        for (const field of requiredField) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`
                });
            }
        }

        // if (Number(amount) < 100) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Minimum withdrawal amount is ₹100",
        //     });
        // }

        // const referenceId = `WD${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

        const user = await userModel.findOne({ _id: userId, status: true }).session(session);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found or inactive" });
        }

        // if (user.mpin != mpin) {
        //     return res.status(401).json({ success: false, message: "Invalid MPIN" });
        // }

        const { commissions, service } = await getApplicableServiceCharge(userId, category);

        const commission = commissions?.slabs?.length
            ? calculateCommissionFromSlabs(amount, commissions)
            : { charge: 0, gst: 0, tds: 0, retailer: 0 };

        const usableBalance = Number(user.eWallet) - Number(user.cappingMoney || 0);

        const required = Number(
            (
                Number(amount) +
                Number(commission.charge) +
                Number(commission.gst) +
                Number(commission.tds) -
                Number(commission.retailer)
            ).toFixed(2)
        );

        if (usableBalance < required) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Required ₹${required}`,
            });
        }

        let updatedUser = await userModel.findOneAndUpdate(
            { _id: userId, eWallet: { $gte: required } },
            { $inc: { eWallet: -required } },
            { new: true, session }
        );

        if (!updatedUser) {
            throw new Error("Wallet deduction failed");
        }

        await payOutModel.create(
            [{
                userId,
                amount,
                reference: referenceId,
                type: service?._id,
                trans_mode: "IMPS",
                name: updatedUser.name,
                mobile: updatedUser.mobileNumber,
                email: updatedUser.email,
                status: "Pending",
                account: beneAccountNo,
                ifsc: beneifsc,
                remark: "Cash Withdraw to bank",
                charges: commission.charge,
                gst: commission.gst,
                tds: commission.tds,
                totalDebit: required,
            }],
            { session }
        );

        await Transaction.create(
            [{
                user_id: userId,
                transaction_type: "debit",
                amount,
                type: service?._id || category,
                gst: commission.gst,
                tds: commission.tds,
                charge: commission.charge,
                totalDebit: required,
                totalCredit: commission.retailer,
                balance_after: updatedUser.eWallet,
                payment_mode: "wallet",
                transaction_reference_id: referenceId,
                description: `Cash Withdraw`,
                status: "Pending",
            }],
            { session }
        );

        await session.commitTransaction();
        isCommitted = true;
        session.endSession();

        const payload = {
            bankProfileId: "1",
            accountNumber: "71603718317",
            latitude: "26.7987",
            longitude: "75.8691",
            amount,
            client_referenceId: referenceId,
            transferMode: "imps",
            remarks: "Cash Withdraw to bank",
            beneDetails: {
                bankAccount: beneAccountNo,
                ifsc: beneifsc,
                name: user.name,
                email: user.email,
                phone: user.mobileNumber,
                address1: "jaipur"
            }
        };


        const aeronpayRes = await axios.post(
            "https://api.sevenunique.com/aeronpay/transfer",
            payload
        );
        console.log("aeronpayRes", aeronpayRes.data)
        return res.status(200).json({
            success: true,
            message: "Transfer initiated successfully",
            referenceId,
            data: aeronpayRes.data
        });

    } catch (error) {
        console.log(error)
        if (!isCommitted) {
            await session.abortTransaction();
            session.endSession();
        }

        return res.status(500).json({
            success: false,
            message: "Transfer failed",
            error: error.response?.data,
        });
    }
};

exports.callBack = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log("AeronPay callback body:", req.body);

        const data = req.body;
        const referenceId = data.client_referenceId || data.referenceId;

        if (!referenceId) {
            return res.status(400).json({
                success: false,
                message: "Reference ID missing in callback",
            });
        }

        // 1️⃣ Fetch payout record
        const payout = await payOutModel.findOne({ reference: referenceId }).session(session);
        if (!payout) {
            throw new Error("Record not found");
        }
        const Trans = await Transaction.findOne({ transaction_reference_id: referenceId }).session(session);
        if (!Trans) {
            throw new Error("Trans Record not found");
        }

        if (["Success", "Failed"].includes(payout.status)) {
            session.endSession();
            return res.status(200).json({
                success: true,
                message: "Transaction already finalized",
                data
            });
        }


        // 2️⃣ Fetch user
        const user = await userModel.findById(payout.userId).session(session);
        if (!user) {
            throw new Error("User not found");
        }

        // 3️⃣ Decide status
        let Status = "Pending";
        let remark = data.description || data.message || "";

        if (data.status === "SUCCESS") {
            Status = "Success";
        }

        if (["PENDING", "ACCEPTED"].includes(data.status)) {
            Status = "Pending";
        }
        let balanceAfter = Trans.balance_after;
        if (data.status === "FAILED") {
            Status = "Failed";

            // 4️⃣ Refund wallet
            if (data.status === "FAILED" && payout.status !== "Failed") {
                await userModel.updateOne(
                    { _id: user._id },
                    { $inc: { eWallet: payout.totalDebit } },
                    { session }
                );
                const updatedUser = await userModel
                    .findById(user._id)
                    .session(session);

                balanceAfter = updatedUser.eWallet;

            }


        }

        // 5️⃣ Update payout
        await payOutModel.updateOne(
            { reference: referenceId },
            {
                status: Status,
                utr: data.utr || data?.data?.utr || "",
                remark,
            },
            { session }
        );

        // 6️⃣ Update transaction

        await Transaction.updateOne(
            { transaction_reference_id: referenceId },
            {
                status: Status,
                utr: data.utr,
                balance_after: balanceAfter,
                description: remark,
                "meta.apiResponse": data
            },
            { session }
        );


        if (user.callbackUrlOut) {
            const response = await axios.post(user.callbackUrlOut, data, {
                headers: { "Content-Type": "application/json" }
            });
            console.log("Callback sent to merchant successfully");
        }


        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            status: Status,
            message: "Callback processed successfully",
            data
        });

    } catch (error) {
        console.error("AeronPay callback error:", error);

        await session.abortTransaction();
        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Callback processing failed",
        });
    }
};

exports.checkTransactionStatus = async (req, res) => {
    const session = await mongoose.startSession();
    let committed = false;

    try {
        session.startTransaction();

        const { client_referenceId } = req.body;

        if (!client_referenceId) {
            return res.status(400).json({
                success: false,
                message: "client_referenceId is required"
            });
        }

        // 1️⃣ Fetch payout record
        const payout = await payOutModel
            .findOne({ reference: client_referenceId })
            .session(session);

        if (!payout) {
            throw new Error("Payout record not found");
        }
        // ❌ Already final state
        if (["Success", "Failed"].includes(payout.status)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(200).json({
                success: true,
                message: "Transaction already finalized",
                status: payout.status
            });
        }

        // 2️⃣ Call AeronPay Status API
        const aeronpayRes = await axios.post(
            "https://api.sevenunique.com/aeronpay/status",
            {
                client_referenceId,
                mobile: "9783640502"
            }
        );

        const data = aeronpayRes.data.data;
        console.log(data);


        // 3️⃣ Normalize status
        let finalStatus = "Pending";
        let remark = data.description || data.message || "";

        if (data.status === "SUCCESS") {
            finalStatus = "Success";
        }
        else if (["PENDING", "ACCEPTED"].includes(data.status)) {
            finalStatus = "Pending";
        }
        else if (
            data.status === "FAILED" ||
            ["400", "404", "444"].includes(data.statusCode)
        ) {
            finalStatus = "Failed";
        }
        else if (data.status === "TOO_MANY_REQUESTS") {
            await session.abortTransaction();
            session.endSession();
            return res.status(429).json({
                success: false,
                message: "Too many requests. Try again later."
            });
        }

        // 4️⃣ Refund if FAILED (only once)
        if (finalStatus === "Failed" && payout.status !== "Failed") {
            await userModel.updateOne(
                { _id: payout.userId },
                { $inc: { eWallet: payout.totalDebit } },
                { session }
            );
        }

        // 5️⃣ Update payout
        await payOutModel.updateOne(
            { reference: client_referenceId },
            {
                status: finalStatus,
                utr: data.utr || "",
                remark
            },
            { session }
        );

        // 6️⃣ Update transaction ledger
        const updatedUser = await userModel.findById(payout.userId).session(session);

        await Transaction.updateOne(
            { transaction_reference_id: client_referenceId },
            {
                status: finalStatus,
                utr: data.utr || "",
                balance_after: updatedUser.eWallet,
                description: remark,
                "meta.statusApiResponse": data
            },
            { session }
        );

        // ✅ Commit
        await session.commitTransaction();
        committed = true;
        session.endSession();

        return res.status(200).json({
            success: true,
            status: finalStatus,
            message: "Transaction status updated",
            data
        });

    } catch (error) {
        console.error("Transaction Status Check Error:", error);

        if (!committed) {
            await session.abortTransaction();
            session.endSession();
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to fetch transaction status",
            data: error.response?.data
        });
    }
};


