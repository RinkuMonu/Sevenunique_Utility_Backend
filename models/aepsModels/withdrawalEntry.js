const mongoose = require('mongoose');

const aepsWithdrawalSchema = new mongoose.Schema(
    {
        status: {
            type: Boolean,
            required: true,
        },
        ackno: {
            type: Number,
            required: true,
        },
        amount: {
            type: String, // or use Number if consistent
            required: true,
        },
        balanceamount: {
            type: String, // or use Number
        },
        bankrrn: {
            type: String, // stored as string to avoid precision issues
            required: true,
        },
        bankiin: {
            type: String,
        },
        mobilenumber: {
            type: String,
            required: true,
        },
        clientrefno: {
            type: String,
            required: true,
        },
        adhaarnumber: {
            type: String,
            required: true,
        },
        submerchantid: {
            type: String,
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        charges: {
            type: Number, // or use Number if consistent
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AEPSWithdrawalTransaction", aepsWithdrawalSchema);
