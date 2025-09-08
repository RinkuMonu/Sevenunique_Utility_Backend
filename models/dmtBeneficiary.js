const mongoose = require("mongoose");

const BeneficiarySchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    type: {
        type: String
    },
    mobile: {
        type: String
    },
    benename: {
        type: String
    },
    bankid: {
        type: String
    },
    accno: {
        type: String
    },
    ifsccode: {
        type: String
    },
    address: {
        type: String
    },
    pincode: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model("Beneficiary", BeneficiarySchema);
