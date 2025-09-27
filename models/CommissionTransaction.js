const mongoose = require("mongoose");

const CommissionTransactionSchema = new mongoose.Schema(
    {
        referenceId: {
            type: String,
            required: true,
        },
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service",
            required: true,
        },
        baseAmount: {
            type: Number,
            required: true,
        },
        charge: {
            type: Number,
            default: 0,
        },
        netAmount: {
            type: Number,
            default: 0,
        },
        roles: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                role: { type: String, enum: ["Retailer", "Distributor", "Admin"], required: true },
                commission: { type: Number, default: 0 },
                chargeShare: { type: Number, default: 0 },
                totalEarned: { type: Number, default: 0 },
            },
        ],
        type: {
            type: String,
            enum: ["credit", "debit"],
            default: "credit",
        },
        status: {
            type: String,
            enum: ["Success", "Pending", "Failed", "Refunded"],
            default: "Success",
        },
        meta: {
            type: Object,
            default: {},
        },
        sourceRetailerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional for distributor/admin reference
    },
    { timestamps: true }
);

// Auto-calculate totalEarned for each role
CommissionTransactionSchema.pre("save", function (next) {
    if (this.roles && this.roles.length) {
        this.roles = this.roles.map(r => ({
            ...r,
            totalEarned: (r.commission || 0) - (r.chargeShare || 0),
        }));
    }
    next();
});

module.exports = mongoose.model(
    "CommissionTransaction",
    CommissionTransactionSchema
);
