const mongoose = require("mongoose");

const dmtReportSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // User ID
    status: {
      type: String,
      enum: ["Pending", "Failed", "Success", "Refunded"],
      default: "Pending"
    },
    ackno: { type: String },
    referenceid: { type: String, required: true },
    utr: { type: String },
    txn_status: { type: String, required: true },
    benename: { type: String },
    remarks: { type: String },
    message: { type: String },
    remitter: { type: String, required: true },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    account_number: { type: String, required: true },
    gatewayCharges: {
      bc_share: { type: Number },
      txn_amount: { type: Number, required: true },
      customercharge: { type: Number, default: 0 },
      gst: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      netcommission: { type: Number, default: 0 },
    },
    charges: { type: Number, default: 0 },
    commission: {
      distributor: { type: Number, default: 0 },
      admin: { type: Number, default: 0 },
    },
    gst: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    totalDebit: { type: Number, default: 0 },
    NPCI_response_code: { type: String },
    bank_status: { type: String },
    provider: {
      type: String,
      enum: ["instantPay", "paySprint", "iserveu"],
      default: "instantPay",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DmtReport", dmtReportSchema);
