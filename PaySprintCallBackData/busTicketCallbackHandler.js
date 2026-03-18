const { default: mongoose } = require("mongoose");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../utils/chargeCaluate");
const userModel = require("../models/userModel");
const Transaction = require("../models/transactionModel");
const bbpsModel = require("../models/bbpsModel");

exports.busTicketCallbackHandler = async (data, user) => {
    const event = data.event;
    const param = data.param;
    const category = "68c936fc8fa1dda33eb541c2";

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

        const { commissions, service } = await getApplicableServiceCharge(user._id, category);

        const commission = commissions?.slabs?.length
            ? calculateCommissionFromSlabs(param.amount, commissions)
            : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

        const required =
            Number(param.total_deduction) +
            commission.charge +
            commission.gst +
            commission.tds -
            commission.retailer;

        const debitAmount = Number(required.toFixed(2));
        const usableBalance = user.eWallet - (user.cappingMoney || 0);

        if (usableBalance < required) {
            throw new Error(`Insufficient wallet balance. Maintain ₹${user.cappingMoney}. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`);
        }

        const updatedUser = await userModel.findOneAndUpdate(
            {
                _id: user._id,
                eWallet: { $gte: required }
            },
            {
                $inc: { eWallet: -required }
            },
            {
                new: true,
                session,
                runValidators: true,
            }
        );

        if (!updatedUser) {
            throw new Error(`Insufficient balance. Required: ₹${debitAmount}, Available: ₹${user.eWallet}`);
        }


        // Debit (booking deduction)
        if (event === "BUS_TICKET_BOOKING_DEBIT_CONFIRMATION") {
            console.log("💸 Debit confirmation callback");


            await Transaction.create(
                [
                    {
                        user_id: user._id,
                        transaction_type: "debit",
                        amount: required,
                        type: service?._id || category,
                        gst: commission.gst,
                        tds: commission.tds,
                        charge: commission.charge,
                        totalDebit: required,
                        totalCredit: commission.retailer,
                        balance_after: updatedUser.eWallet,
                        payment_mode: "wallet",
                        transaction_reference_id: param.refid,
                        description: `Bus ticket booking debit confirmed for blockId ${param.blockKey}`,
                        status: "Success",
                        provider: "paySprint",
                    },
                ],
                { session }
            );

            await bbpsModel.create([{
                userId: user._id,
                rechargeType: service?._id,
                operator: "Generate Url",
                customerNumber: updatedUser.mobileNumber,
                amount: Number(param.amount),

                charges: Number(commission.charge || 0),

                retailerCommission: updatedUser.role === "User" ? 0 : Number(commission.retailer || 0),

                distributorCommission: Number(commission.distributor || 0),

                adminCommission: Number(commission.admin || 0),

                gst: Number(commission.gst || 0),
                tds: Number(commission.tds || 0),
                totalCommission: Number(commission.totalCommission || 0),
                totalDebit: Number(required),

                transactionId: param.refid,
                extraDetails: { res: data },
                status: "Success",
                provider: "paySprint",
            }], { session });
        }

        // Credit (booking cancellation refund)
        else if (event === "BUS_TICKET_BOOKING_CREDIT_CONFIRMATION") {
            console.log("💰 Credit confirmation callback");
            const updatedUser = await userModel.findOneAndUpdate(
                {
                    _id: user._id
                },
                {
                    $inc: { eWallet: +required }
                },
                {
                    new: true,
                    session,
                    runValidators: true,
                }
            );

            await Transaction.create(
                [
                    {
                        user_id: user._id,
                        transaction_type: "credit",
                        amount: required,
                        type: service?._id || category,
                        gst: commission.gst,
                        tds: commission.tds,
                        charge: commission.charge,
                        totalDebit: required,
                        totalCredit: commission.retailer,
                        balance_after: updatedUser.eWallet,
                        payment_mode: "wallet",
                        transaction_reference_id: param.refid,
                        description: `Bus ticket booking credit confirmed for blockId ${param.blockKey}`,
                        status: "Refunded",
                        provider: "paySprint",
                        meta: {
                            res: data
                        },
                    },
                ],
                { session }
            );

            await bbpsModel.create([{
                userId: user._id,
                rechargeType: service?._id,
                operator: "Generate Url",
                customerNumber: updatedUser.mobileNumber,
                amount: Number(param.amount),

                charges: Number(commission.charge || 0),

                retailerCommission: updatedUser.role === "User" ? 0 : Number(commission.retailer || 0),

                distributorCommission: Number(commission.distributor || 0),

                adminCommission: Number(commission.admin || 0),

                gst: Number(commission.gst || 0),
                tds: Number(commission.tds || 0),
                totalCommission: Number(commission.totalCommission || 0),
                totalDebit: Number(required),

                transactionId: param.refid,
                extraDetails: { res: data },
                status: "Refunded",
                provider: "paySprint",
            }], { session });
        }

        // Ticket Confirmation 
        else if (event === "BUS_TICKET_BOOKING_CONFIRMATION") {
            console.log("🎟️ Ticket final confirmation callback");

            await Transaction.create(
                [
                    {
                        user_id: user._id,
                        transaction_type: "debit",
                        amount: required,
                        type: service?._id || category,
                        gst: commission.gst,
                        tds: commission.tds,
                        charge: commission.charge,
                        totalDebit: required,
                        totalCredit: commission.retailer,
                        balance_after: updatedUser.eWallet,
                        payment_mode: "wallet",
                        transaction_reference_id: param.refid,
                        description: `Bus ticket booking debit confirmed for blockId ${param.blockKey}`,
                        status: "Success",
                        provider: "paySprint",
                        meta: {
                            res: data
                        },
                    },
                ],
                { session }
            );

            await bbpsModel.create([{
                userId: user._id,
                rechargeType: service?._id,
                operator: "Generate Url",
                customerNumber: updatedUser.mobileNumber,
                amount: Number(param.amount),

                charges: Number(commission.charge || 0),

                retailerCommission: updatedUser.role === "User" ? 0 : Number(commission.retailer || 0),

                distributorCommission: Number(commission.distributor || 0),

                adminCommission: Number(commission.admin || 0),

                gst: Number(commission.gst || 0),
                tds: Number(commission.tds || 0),
                totalCommission: Number(commission.totalCommission || 0),
                totalDebit: Number(required),

                transactionId: param.refid,
                extraDetails: { res: data },
                status: "Success",
                provider: "paySprint",
            }], { session });
        }

        await session.commitTransaction();

        return {
            status: 200,
            message: "Transaction completed successfully",
        };
    } catch (error) {
        await session.abortTransaction();

        console.error("❌ Callback error:", error.message);
        return {
            status: 400,
            message: "Transaction failed",
        };
    } finally {
        session.endSession();
    }
}