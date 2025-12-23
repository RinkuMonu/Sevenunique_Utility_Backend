const mongoose  = require("mongoose");

const scratchCouponSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    serviceTxnId: { type: String, unique: true },
    serviceName: String,

    baseAmount: Number,
    cashbackAmount: Number,

    status: {
        type: String,
        enum: ["UNSCRATCHED", "SCRATCHED", "EXPIRED"],
        default: "UNSCRATCHED"
    },

    scratchedAt: Date,
    expiresAt: Date,

    createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model("ScratchCoupon", scratchCouponSchema);
