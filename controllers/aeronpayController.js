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
    session.startTransaction();

    try {

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

        // await payOutModel.create(
        //     [{
        //         userId,
        //         amount,
        //         reference: referenceId,
        //         type: service?._id,
        //         trans_mode: "IMPS",
        //         name: updatedUser.name,
        //         mobile: updatedUser.mobileNumber,
        //         email: updatedUser.email,
        //         status: "Pending",
        //         account: beneAccountNo,
        //         ifsc: beneifsc,
        //         remark: "Cash Withdraw to bank",
        //         charges: commission.charge,
        //         gst: commission.gst,
        //         tds: commission.tds,
        //         totalDebit: required,
        //     }],
        //     { session }
        // );

        // await Transaction.create(
        //     [{
        //         user_id: userId,
        //         transaction_type: "debit",
        //         amount,
        //         type: service?._id || category,
        //         gst: commission.gst,
        //         tds: commission.tds,
        //         charge: commission.charge,
        //         totalDebit: required,
        //         totalCredit: commission.retailer,
        //         balance_after: updatedUser.eWallet,
        //         payment_mode: "wallet",
        //         transaction_reference_id: referenceId,
        //         description: `Cash Withdraw`,
        //         status: "Pending",
        //     }],
        //     { session }
        // );

        const payload = {
            bankProfileId: "1",
            accountNumber: "9783640502",
            latitude,
            longitude,
            amount,
            client_referenceId: referenceId,
            transferMode: "IMPS",
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
            // "http://localhost:5051/aeronpay/transfer",
            payload,
            { headers: aeronpayHeader }
        );
        console.log("aeronpayRes", aeronpayRes)
        return;

        const data = aeronpayRes.data;
        let Status = "Pending";
        let remark = data.description || data.message || "";

        if (data.status === "SUCCESS") {
            Status = "Success";
        }

        if (["PENDING", "ACCEPTED"].includes(data.status)) {
            Status = "Pending";
        }

        if (data.status === "FAILED") {
            Status = "Failed";

            // Refund wallet
            updatedUser = await userModel.findByIdAndUpdate(
                userId,
                { $inc: { eWallet: required } },
                { session }
            );
        }

        await payOutModel.findOneAndUpdate(
            { reference: referenceId },
            {
                status: Status,
                utr: data.utr || data?.data?.utr || "",
                remark,
            },
            { session }
        );

        await Transaction.findOneAndUpdate(
            { transaction_reference_id: referenceId },
            {
                status: Status,
                balance_after: updatedUser.eWallet,
                description: remark,
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            status: Status,
            message: remark || "Transfer initiated",
            data,
        });

    } catch (error) {
        console.log(error)
        await session.abortTransaction();
        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Transfer failed",
            error: error.response?.data,
        });
    }
};

exports.callBack = async (req, res) => {
    try {
        console.log("aeronPay callBack body data", req.body);
        console.log("aeronPay callBack query data", req.query);
        const data = req.body

        res.send({
            status: true,
            data
        })

    } catch (error) {
        console.log("aeronpay.callBack error", error);

        res.send({
            status: false,
            massage: error
        })
    }

}