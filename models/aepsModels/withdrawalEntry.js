const mongoose = require("mongoose");

const aepsTransactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // 👇 Transaction type (Withdrawal or Deposit)
        type: {
            type: String,
            enum: ["Withdrawal", "Deposit", "BalanceEnquiry", "MiniStatement"],
            required: true,
        },

        // ✅ AEPS/Bank Details
        adhaarnumber: { type: String, required: true },
        mobilenumber: { type: String, required: true },
        bankiin: { type: String },
        submerchantid: { type: String },

        // ✅ Transaction Details
        amount: { type: Number },
        balanceamount: { type: Number },
        bankrrn: { type: String },
        clientrefno: { type: String, required: true },
        ackno: { type: String },

        // ✅ Charges & Commission Info
        charges: { type: Number, default: 0 },
        gst: { type: Number, default: 0 },
        tds: { type: Number, default: 0 },
        retailerCommission: { type: Number, default: 0 },
        distributorCommission: { type: Number, default: 0 },
        adminCommission: { type: Number, default: 0 },

        // ✅ Unified Status
        status: {
            type: String,
            enum: ["Pending", "Success", "Failed"],
            default: "Pending",
        },

        // ✅ Raw API Response (from InstantPay)
        apiResponse: {
            type: Object,
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AEPSTransaction", aepsTransactionSchema);
