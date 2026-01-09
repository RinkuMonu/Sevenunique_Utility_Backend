const { default: axios } = require("axios");
const { default: mongoose } = require("mongoose");
const userModel = require("../../models/userModel");
const { getApplicableServiceCharge, calculateCommissionFromSlabs, logApiCall } = require("../../utils/chargeCaluate");
const payOutModel = require("../../models/payOutModel");
const Transaction = require("../../models/transactionModel");
const crypto = require("crypto");

const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": process.env.IPAY_AUTH_CODE,
        "X-Ipay-Client-Id": process.env.INSTANTPAY_CLIENT_ID,
        "X-Ipay-Client-Secret": process.env.INSTANTPAY_CLIENT_SECRET,
        "X-Ipay-Endpoint-Ip": "223.226.127.0"
    };
};


const encryptionKey = "efb0a1c3666c5fb0efb0a1c3666c5fb0" || process.env.INSTANTPAY_AES_KEY

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
            session.startTransaction();
            const {
                beneName,
                beneAccountNo,
                beneifsc,
                paymentMode,
                transferMode = "IMPS",
                amount,
                externalRef,
                latitude,
                longitude,
                remarks,
                mpin,
                category,
                custMobNo,
                referenceNumber,
                cardNumber,
                payeeCardHolderName
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

            if (user.mpin != mpin) throw new Error("Invalid MPIN");

            const { commissions, service } = await getApplicableServiceCharge(userId, category);

            const commission = commissions?.slabs?.length
                ? calculateCommissionFromSlabs(amount, commissions)
                : { charge: 0, gst: 0, tds: 0, retailer: 0 };

            const required =
                Number(amount) +
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
                amount: amount,
                type: service?._id,
                trans_mode: "WALLET",
                name: beneName,
                account: beneAccountNo,
                ifsc: beneifsc,
                mobile: custMobNo,
                email: user.email,
                charges: commission.charge,
                gst: commission.gst,
                tds: commission.tds,
                totalDebit: required,
                status: "Pending",
            });


            let instantPayPayload = {};

            switch (transferMode) {

                case "IMPS":
                case "NEFT":
                case "RTGS":
                    instantPayPayload = {
                        payer: { bankProfileId: "0", accountNumber: "9660339514" },
                        payee: {
                            name: beneName,
                            accountNumber: beneAccountNo,
                            bankIfsc: beneifsc
                        },
                        transferMode,
                        transferAmount: amount,
                        externalRef,
                        latitude,
                        longitude,
                        remarks
                    };
                    break;

                case "CREDITCARD":
                    instantPayPayload = {
                        payer: {
                            bankId: "0",
                            bankProfileId: "0",
                            accountNumber: "9660339514",
                            name: "DINESH KUMAR PRAJAPAT",
                            paymentMode,
                            cardNumber: encrypt(cardNumber, encryptionKey),
                            referenceNumber
                        },
                        payee: {
                            accountNumber: encrypt(beneAccountNo, encryptionKey),
                            name: payeeCardHolderName
                        },
                        transferMode: "CREDITCARD",
                        transferAmount: amount,
                        externalRef,
                        latitude,
                        longitude,
                        remarks
                    };
                    break;

                default:
                    return res.status(400).json({
                        success: false,
                        message: "Invalid transfer mode"
                    });
            }


            // payload = {
            //     payer: { bankProfileId: "0", accountNumber: "9660339514" },
            //     payee: {
            //         name: payee.name,
            //         accountNumber: payee.accountNumber,
            //         bankIfsc: payee.bankIfsc,
            //     },
            //     transferMode,
            //     transferAmount,
            //     externalRef,
            //     latitude,
            //     longitude,
            //     Remarks: remarks,
            // };

            let apiResponse;

            try {
                apiResponse = await axios.post(
                    "https://api.instantpay.in/payments/payout",
                    instantPayPayload,
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
                requestData: instantPayPayload,
                responseData: apiResponse.data,
            });
            console.log(apiResponse);


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
                    type: service?._id || "",
                    amount: amount,
                    totalDebit: 0,
                    balance_after: user.eWallet,
                    transaction_reference_id: externalRef,
                    description: `Payout failed to ${beneName}`,
                    status: "Failed",
                    "meta.apiResponse": apiResponse.data
                });

                return res.status(400).json({
                    success: false,
                    message: apiResponse.data.status || "Transaction failed",
                    data: apiResponse.data
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
                        amount: amount,
                        charge: commission.charge,
                        gst: commission.gst,
                        tds: commission.tds,
                        totalDebit: debitAmount,
                        balance_after: updatedUser.eWallet,
                        transaction_reference_id: externalRef,
                        description: `Money transfer to ${beneName}`,
                        status: "Success",
                        "meta.apiResponse": apiResponse.data
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
