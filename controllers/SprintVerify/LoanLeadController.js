const { default: axios } = require("axios")
const mongoose = require("mongoose");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const { logApiCall, getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../../utils/chargeCaluate");
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const BbpsHistory = require("../../models/bbpsModel.js");


function getPaysprintHeaders() {
    return {
        Token: generatePaysprintJWT(),
        Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_P,
        "content-type": "application/json",
        'accept': "application/json"
    };
}


exports.Generate_URL = async (req, res) => {
    try {
        const { merchantcode, name, mobile_no, email, product } = req.body;
        const refid = `REF${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        const payload = {
            refid,
            merchantcode,
            name,
            email,
            mobile_no,
            product
        }
        console.log(getPaysprintHeaders());

        const response = await axios.post("https://sit.paysprint.in/service-api/api/v1/service/lead/generation",
            payload,
            { headers: getPaysprintHeaders() }
        )
        logApiCall({ url: "https://sit.paysprint.in/service-api/api/v1/service/lead/generation", requestData: { headers: getPaysprintHeaders(), payload }, responseData: response.data });
        console.log(response.data);
        res.send({
            status: true,
            res: response.data
        })

    } catch (error) {
        console.log("fetch loanLead error", error)
        res.send({
            statua: false,
            res: error?.response?.data
        })
    }
}


exports.Lead_status_check = async (req, res) => {

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
            "https://sit.paysprint.in/service-api/api/v1/service/bill-payment/bill/licstatus",
            { referenceid },
            { headers: getPaysprintHeaders() }
        );
        logApiCall({ url: "https://sit.paysprint.in/service-api/api/v1/service/bill-payment/bill/licstatus", requestData: { headers: getPaysprintHeaders(), referenceid }, responseData: response.data });


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
