const { default: axios } = require("axios")
const mongoose = require("mongoose");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const { logApiCall, getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../../utils/chargeCaluate");
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const BbpsHistory = require("../../models/bbpsModel.js");
const userMetaModel = require("../../models/userMetaModel.js");
const { default: admin } = require("../../firebase.js");


function getPaysprintHeaders() {
    return {
        Token: generatePaysprintJWT(),
        Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_P,
        "content-type": "application/json",
        'accept': "application/json"
    };
}


exports.fetchBill = async (req, res) => {
    try {
        const { canumber, ad1, ad2, mode } = req.body;
        const payload = {
            canumber,
            ad1,
            ad2,
            mode
        }
        const response = await axios.post("https://api.paysprint.in/api/v1/service/bill-payment/bill/fetchlicbill",
            payload,
            { headers: getPaysprintHeaders() }
        )
        logApiCall({ url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/fetchlicbill", requestData: { headers: getPaysprintHeaders(), payload }, responseData: response.data });
        console.log(response.data);
        res.send({
            statua: true,
            res: response.data
        })

    } catch (error) {
        console.log("fetch bill error", error)
        res.send({
            statua: false,
            res: error.response.data
        })
    }
}


exports.payBill = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();


    const userId = req.user.id;
    const category = "68c938d38fa1dda33eb54204"
    const { canumber, mode, amount, ad1, ad2, latitude, longitude, bill_fetch, mpin } = req.body;
    const referenceid = `REF${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
        canumber, mode, amount, referenceid, ad1, ad2, latitude, longitude, bill_fetch
    }
    try {
        const { commissions, service } = await getApplicableServiceCharge(userId, category);


        // ✅ Check for slabs
        let commission = commissions?.slabs?.length
            ? calculateCommissionFromSlabs(amount, commissions)
            : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

        const user = await userModel.findOne({ _id: userId }).session(session);
        const userMeta = await userMetaModel.findOne({ userId }).session(session);

        if (user.mpin != mpin) {
            throw new Error("Invalid mpin ! Please enter a vaild mpin");
        }
        // if (redis) {
        //     rechargeLockKey = `recharge_lock:${userId}:${operatorName}:${canumber}:${amount}`;
        //     rechargeLockValue = uuid();

        //     const rechargeLocked = await acquireLock(rechargeLockKey, rechargeLockValue, 120);

        //     if (!rechargeLocked) {
        //         return res.status(429).json({
        //             success: false,
        //             message: "Same recharge already in progress please wait some tims(s)",
        //         });
        //     }
        // }


        const usableBalance = user.eWallet - (user.cappingMoney || 0);
        const retailerBenefit = user.role === "User" ? 0 : Number(commission.retailer || 0);
        const required = Number((
            Number(amount) +
            Number(commission.charge || 0) +
            Number(commission.gst || 0) + Number(commission.tds || 0) - Number(retailerBenefit || 0)
        ).toFixed(2));

        if (usableBalance < required) {
            throw new Error(`Insufficient wallet balance. You must maintain ₹${user.cappingMoney} in your wallet. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`)
        }

        // if (redis) {
        //     walletLockKey = `wallet_lock:${userId}`;
        //     walletLockValue = uuid();
        //     const walletLocked = await acquireLock(walletLockKey, walletLockValue, 5);
        //     if (!walletLocked) {
        //         throw new Error("Wallet busy, please retry in few seconds");
        //     }
        // }

        // ✅ Deduct from wallet

        const updateUser = await userModel.findByIdAndUpdate(
            userId,
            { $inc: { eWallet: -required } },
            { new: true, session }
        );

        // ✅ Create debit transaction
        const debitTxn = await Transaction.create([{
            user_id: userId,
            transaction_type: "debit",
            amount: Number(amount),
            type: service._id,
            gst: Number(commission.gst),
            tds: Number(commission.tds),
            charge: Number(commission.charge),
            totalDebit: Number(required),
            totalCredit: user.role === "User" ? 0 : Number(commission.retailer || 0),
            balance_after: updateUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: referenceid,
            description: `Insurance Premium Bill Pay for CA Number - ${canumber} (${mode})`,
            status: "Pending",
            provider: "paySprint",
        }], { session });

        const rechargeRecord = await BbpsHistory.create([{
            userId,
            rechargeType: service?._id,
            operator: mode,
            customerNumber: canumber,
            amount: Number(amount),

            charges: Number(commission.charge || 0),

            retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

            distributorCommission: Number(commission.distributor || 0),

            adminCommission: Number(commission.admin || 0),

            gst: Number(commission.gst || 0),
            tds: Number(commission.tds || 0),
            totalCommission: Number(commission.totalCommission || 0),
            totalDebit: Number(required),

            transactionId: referenceid,
            extraDetails: { "CA Number": canumber },
            status: "Pending",
            provider: "paySprint",
        }], { session });


        const response = await axios.post("https://api.paysprint.in/api/v1/service/bill-payment/bill/paylicbill",
            payload,
            { headers: getPaysprintHeaders() }
        )

        logApiCall({ url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/paylicbill", requestData: { headers: getPaysprintHeaders(), payload }, responseData: response.data });

        const responseCode = response?.data?.response_code
        if (responseCode == 1) {

            await Transaction.updateOne(
                { transaction_reference_id: referenceid },
                {
                    $set: {
                        status: "Success",
                        "meta.res": response?.data
                    }
                },
                { session }
            );

            await BbpsHistory.updateOne(
                { transactionId: referenceid },
                { status: "Success" },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            if (userMeta?.fcm_Token) {
                await admin.messaging().send({
                    token: userMeta.fcm_Token,
                    notification: {
                        title: "Finunique",
                        body: `Insurance Premium Bill Pay for CA Number - ${canumber} (${mode})`
                    },
                });
            }

            return res.json({
                success: true,
                message: "Bill Payment Successful",
                data: response?.data
            });
        }
        else if ([2, 5, 12, 14, 16, 11, 17, 8].includes(responseCode)) {

            await userModel.findByIdAndUpdate(
                userId,
                { $inc: { eWallet: required } },
                { session }
            );

            // Update transaction
            await Transaction.updateOne(
                { transaction_reference_id: referenceid },
                {
                    $set: {
                        status: "Failed",
                        "meta.res": response?.data
                    }
                },
                { session }
            );

            await BbpsHistory.updateOne(
                { transactionId: referenceid },
                { status: "Failed" },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return res.json({
                success: false,
                message: "Bill Payment Failed & Amount Refunded",
                data: response?.data
            });
        } else if (responseCode == 0) {

            await Transaction.updateOne(
                { transaction_reference_id: referenceid },
                {
                    $set: {
                        status: "Pending",
                        "meta.res": response?.data
                    }
                },
                { session }
            );

            await BbpsHistory.updateOne(
                { transactionId: referenceid },
                { status: "Pending" },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return res.json({
                success: true,
                message: "Pending. Please Re-query",
                data: response?.data
            });
        }
        res.send({
            statua: true,
            data: response.data
        })

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Transaction Failed",
            error: error?.response?.data || error.message
        });
    }

}


exports.StatusEnquiry = async (req, res) => {

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

        const { referenceid } = req.body;

        const txn = await Transaction.findOne({
            transaction_reference_id: referenceid
        }).session(session);

        if (!txn) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: "Transaction not found"
            });
        }

        // 🔥 If already final state, return directly
        if (txn.status === "Success" || txn.status === "Failed") {
            await session.abortTransaction();
            session.endSession();
            return res.json({
                success: true,
                message: "Transaction already settled",
                status: txn.status
            });
        }

        // 🔹 Call provider status API
        const response = await axios.post(
            "https://api.paysprint.in/api/v1/service/bill-payment/bill/licstatus",
            { referenceid },
            { headers: getPaysprintHeaders() }
        );
        logApiCall({ url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/licstatus", requestData: { headers: getPaysprintHeaders(), referenceid }, responseData: response.data });


        const responseCode = response?.data?.responsecode;

        // =============================
        // ✅ SUCCESS
        // =============================
        if (responseCode == 1) {

            await Transaction.updateOne(
                { transaction_reference_id: referenceid },
                {
                    $set: {
                        status: "Success",
                        "meta.statusRes": response.data
                    }
                },
                { session }
            );

            await BbpsHistory.updateOne(
                { transactionId: referenceid },
                { status: "Success" },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return res.json({
                success: true,
                message: response.data.message || "Transaction Successful",
                data: response.data
            });
        }

        // =============================
        // ❌ FAILED / REFUND
        // =============================
        else if (responseCode == 0) {

            // 🛑 Prevent double refund
            if (txn.status !== "Failed") {

                await userModel.findByIdAndUpdate(
                    txn.user_id,
                    { $inc: { eWallet: txn.totalDebit } },
                    { session }
                );

                await Transaction.updateOne(
                    { transaction_reference_id: referenceid },
                    {
                        $set: {
                            status: "Failed",
                            "meta.statusRes": response.data
                        }
                    },
                    { session }
                );

                await BbpsHistory.updateOne(
                    { transactionId: referenceid },
                    { status: "Failed" },
                    { session }
                );
            }

            await session.commitTransaction();
            session.endSession();

            return res.json({
                success: false,
                message: response.data.message || "Transaction Failed & Amount Refunded",
                data: response.data
            });
        }

        // =============================
        // ⏳ PENDING
        // =============================
        else {

            await Transaction.updateOne(
                { transaction_reference_id: referenceid },
                {
                    $set: {
                        status: "Pending",
                        "meta.statusRes": response.data
                    }
                },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            return res.json({
                success: true,
                message: response.data.message || "Transaction Still Pending",
                data: response.data
            });
        }

    } catch (error) {

        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Status enquiry failed",
            error: error?.response?.data || error.message
        });
    }
};
