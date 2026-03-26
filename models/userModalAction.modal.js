const mongoose = require("mongoose");

const userActionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        actionType: {
            type: String,
            enum: [
                "BECOME_RETAILER",
                "BECOME_DISTRIBUTOR",
                "BECOME_API_PARTNER",
                "ACCOUNT_SUSPEND",
                "ACCOUNT_DEACTIVATE",
                "ACCOUNT_REACTIVATE",
            ],
            required: true,
        },

        fromRole: {
            type: String,
            required: true,
        },

        toRole: {
            type: String,
            required: false,
        },

        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
        },
        actedAt: {
            type: Date,
            default: null,
        },
        actedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        remarks: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);
userActionSchema.index({ status: 1 });
userActionSchema.index({ userId: 1 });
userActionSchema.index({ actionType: 1 });
userActionSchema.index({ userId: 1, actionType: 1, status: 1 });

module.exports = mongoose.model("UserActionModal", userActionSchema);
