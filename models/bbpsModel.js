const mongoose = require('mongoose');

const bbpsHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rechargeType: {
      type: String,
      required: true,
    },
    operator: {
      type: String,
      required: true,
      trim: true,
    },
    customerNumber: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    retailerCommission: { type: Number, default: 0 },
    distributorCommission: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    charges: {
      type: Number,
      min: 0,
      default: 0
    },
    gst: {
      type: Number,
      min: 0,
      default: 0
    },
    tds: {
      type: Number,
      min: 0,
      default: 0
    },
    totalDebit: { type: Number, default: 0 },
    transactionId: {
      type: String,
      trim: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['Success', 'Failed', 'Pending', 'Refunded'],
      default: 'Pending',
    },
    extraDetails: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Optional: Add an index for faster lookups
bbpsHistorySchema.index({ userId: 1 });

module.exports = mongoose.model('BbpsHistory', bbpsHistorySchema);