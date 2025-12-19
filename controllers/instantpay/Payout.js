const { default: axios } = require("axios");
const { default: mongoose } = require("mongoose");
const userModel = require("../../models/userModel");
const { getApplicableServiceCharge, calculateCommissionFromSlabs, logApiCall } = require("../../utils/chargeCaluate");
const payOutModel = require("../../models/payOutModel");
const Transaction = require("../../models/transactionModel");

const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": process.env.IPAY_AUTH_CODE,
        "X-Ipay-Client-Id": process.env.INSTANTPAY_CLIENT_ID,
        "X-Ipay-Client-Secret": process.env.INSTANTPAY_CLIENT_SECRET,
        "X-Ipay-Endpoint-Ip": "223.226.127.0"
    };
};

class InstantPay_payout {

    async bankList(req, res) {
        try {

            const bankList = await axios.get("https://api.instantpay.in/payments/payout/banks", {
                headers: getHeaders()
            });
            console.log(bankList)
            return res.status(200).json({
                success: true,
                message: "Bank list",
                data: bankList.data
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }

    async transfer(req, res) {
        const session = await mongoose.startSession();

        try {
            const {
                payee,
                transferMode,
                transferAmount,
                externalRef,
                latitude,
                longitude,
                remarks,
                mpin,
                category,
                custMobNo,
            } = req.body;

            const userId = req.user.id;

            if (!externalRef) {
                return res.status(400).json({ success: false, message: "externalRef required" });
            }

            const existingTxn = await payOutModel.findOne({ reference: externalRef });
            if (existingTxn) {
                return res.status(409).json({
                    success: false,
                    message: "Duplicate transaction reference",
                    status: existingTxn.status,
                });
            }

            const user = await userModel.findOne({ _id: userId, status: true });
            if (!user) throw new Error("User not found or inactive");

            if (user.mpin !== mpin) throw new Error("Invalid MPIN");

            const { commissions, service } = await getApplicableServiceCharge(userId, category);

            const commission = commissions?.slabs?.length
                ? calculateCommissionFromSlabs(transferAmount, commissions)
                : { charge: 0, gst: 0, tds: 0, retailer: 0 };

            const required =
                Number(transferAmount) +
                commission.charge +
                commission.gst +
                commission.tds -
                commission.retailer;

            const usableBalance = user.eWallet - (user.cappingMoney || 0);
            if (usableBalance < required) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient wallet balance",
                });
            }

            const payoutDoc = await payOutModel.create({
                userId,
                reference: externalRef,
                amount: transferAmount,
                type: service?._id,
                trans_mode: transferMode,
                name: payee.name,
                account: payee.accountNumber,
                ifsc: payee.bankIfsc,
                mobile: custMobNo,
                email: user.email,
                charges: commission.charge,
                gst: commission.gst,
                tds: commission.tds,
                totalDebit: required,
                status: "Pending",
            });


            const payload = {
                payer: { bankProfileId: "0", accountNumber: "9660339514" },
                payee: {
                    name: payee.name,
                    accountNumber: payee.accountNumber,
                    bankIfsc: payee.bankIfsc,
                },
                transferMode,
                transferAmount,
                externalRef,
                latitude,
                longitude,
                Remarks: remarks,
            };

            let apiResponse;

            try {
                apiResponse = await axios.post(
                    "https://api.instantpay.in/payments/payout",
                    payload,
                    { headers: getHeaders(), timeout: 15000 }
                );
            } catch (apiErr) {
                await payOutModel.updateOne(
                    { _id: payoutDoc._id },
                    { $set: { status: "Failed", api_response: apiErr.message } }
                );

                return res.status(502).json({
                    success: false,
                    message: "Payout API failed",
                });
            }

            logApiCall({
                url: "/instantpay/payout",
                requestData: payload,
                responseData: apiResponse.data,
            });


            if (apiResponse.data?.statuscode !== "TXN") {
                await payOutModel.updateOne(
                    { _id: payoutDoc._id },
                    {
                        $set: {
                            status: "Failed",
                            api_response: apiResponse.data,
                        },
                    }
                );

                await Transaction.create({
                    user_id: userId,
                    transaction_type: "debit",
                    amount: transferAmount,
                    totalDebit: 0,
                    balance_after: user.eWallet,
                    transaction_reference_id: externalRef,
                    description: `Payout failed to ${payee.name}`,
                    status: "Failed",
                    "meta.apiResponse": apiResponse
                });

                return res.status(400).json({
                    success: false,
                    message: "Transaction failed",
                });
            }

            await session.startTransaction();

            const debitAmount = Number(required.toFixed(2));

            const updatedUser = await userModel.findOneAndUpdate(
                { _id: userId, eWallet: { $gte: debitAmount } },
                { $inc: { eWallet: -debitAmount } },
                { new: true, session }
            );

            if (!updatedUser) {
                throw new Error("Wallet debit failed");
            }

            await payOutModel.updateOne(
                { _id: payoutDoc._id },
                {
                    $set: {
                        status: "Success",
                        api_response: apiResponse.data,
                    },
                },
                { session }
            );

            await Transaction.create(
                [
                    {
                        user_id: userId,
                        transaction_type: "debit",
                        amount: transferAmount,
                        charge: commission.charge,
                        gst: commission.gst,
                        tds: commission.tds,
                        totalDebit: debitAmount,
                        balance_after: updatedUser.eWallet,
                        transaction_reference_id: externalRef,
                        description: `Money transfer to ${payee.name}`,
                        status: "Success",
                        "meta.apiResponse": apiResponse
                    },
                ],
                { session }
            );

            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message: "Transfer successful",
                data: apiResponse.data,
            });

        } catch (error) {
            await session.abortTransaction();
            console.error(error);

            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error",
            });
        } finally {
            session.endSession();
        }
    }



}

module.exports = InstantPay_payout;
