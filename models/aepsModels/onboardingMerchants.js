const mongoose = require('mongoose');

const onboardTransactionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    merchantcode: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    firm: { type: String },
    callback: { type: String },
    requestedAt: { type: Date, default: Date.now },
    activatedAt: { type: Date },
    activationStatus: { type: String, enum: ['Pending', 'Activated', 'Failed'], default: 'Pending' },
    refno: { type: String },
    txnid: { type: String },
    status: { type: String, enum: ['Pending', 'Accepted', 'Failed'], default: 'Pending' },
    partnerid: { type: String },
    bank: {
        Bank1: { type: Number },
        Bank2: { type: Number }
    },
    callbackReceivedAt: { type: Date },

}, { timestamps: true });

module.exports = mongoose.model('OnboardTransaction', onboardTransactionSchema);
