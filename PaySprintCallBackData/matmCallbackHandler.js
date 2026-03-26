const matmModel = require("../models/matm.model");
const Transaction = require("../models/transactionModel");

exports.matmCallbackHandler = async (data) => {
    try {
        const param = data.param_inc;

        if (!param) {
            return res.status(400).json({ message: "Invalid callback data" });
        }

        // 🔐 Decode JWT
        const decoded = jwt.verify(param, process.env.PAYSPRINT_JWT_SECRET);

        console.log("Decoded MATM Callback:", decoded);

        const {
            status,
            txnstatus,
            message,
            ackno,
            amount,
            bankrrn,
            cardnumber,
            bankName,
            response_code,
            response,
            transactiontype,
            txnrefrenceNo,
            balance
        } = decoded;

        // 🔎 Find MATM transaction
        const matmTxn = await matmModel.findOne({
            txnId: txnrefrenceNo
        });

        if (!matmTxn) {
            console.log("MATM txn not found:", txnrefrenceNo);
            return { message: "Transaction not found" };
        }

        let txnStatus = "Pending";

        if (status === true && txnstatus === 1) {
            txnStatus = "Success";
        }

        if (status === true && txnstatus === 3) {
            txnStatus = "Failed";
        }

        // 📝 Update MATM transaction
        matmTxn.status = txnStatus;
        matmTxn.rrn = bankrrn;
        matmTxn.apiRes = data;
        matmTxn.balance_after = balance;

        await matmTxn.save();


        const existingTxn = await Transaction.findOne({
            transaction_reference_id: txnrefrenceNo
        });

        if (!existingTxn) {

            await Transaction.create({
                user_id: matmTxn.userId,
                transaction_type: "debit",
                type2: "MATM",
                amount: Number(amount),
                charge: matmTxn.charge,
                gst: matmTxn.gst,
                tds: matmTxn.tds,
                totalDebit: Number(amount) + (matmTxn.charge || 0),
                balance_after: balance || matmTxn.balance_after,
                status: txnStatus,
                bankRRN: bankrrn,
                provider: "paySprint",
                transaction_reference_id: txnrefrenceNo,
                description: "MATM Cash Withdraw",
                meta: decoded
            });

        } else {

            existingTxn.status = txnStatus;
            existingTxn.bankRRN = bankrrn;
            existingTxn.meta = decoded;

            await existingTxn.save();
        }

        return {
            success: true,
            message: "Callback processed"
        };

    } catch (error) {
        console.error("MATM Callback Error:", error);
        return {
            success: false,
            message: "Callback failed"
        };
    }
};