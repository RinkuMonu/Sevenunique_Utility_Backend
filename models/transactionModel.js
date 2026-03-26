const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender_Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    transaction_type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
    },
    type2: { type: String },
    amount: {
      type: Number,
      required: true,
    },
    gst: {
      type: Number,
      default: 0,
    },
    tds: {
      type: Number,
      default: 0,
    },
    charge: {
      type: Number,
      default: 0,
    },
    totalDebit: {
      type: Number,
      default: 0,
    },
    totalCredit: {
      type: Number,
      default: 0,
    },
    // netAmount: {
    //   type: Number,
    //   default: 0,
    // },

    balance_after: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Success", "Pending", "Failed", "Refunded"],
      default: "Pending",
    },
    bankRRN: {
      type: String,
    },
    payment_mode: {
      type: String,
      default: "wallet"
    },
    transaction_reference_id: {
      type: String,

    },
    utr: {
      type: String,
      default: ""
    },
    description: {
      type: String,
      default: "",
    },
    provider: {
      type: String,
      enum: ["instantPay", "paySprint", "iserveu", ""],
      default: "",
    },
    meta: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ user_id: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index(
  { transaction_reference_id: 1 },
  { unique: true, sparse: true }
);

const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;
