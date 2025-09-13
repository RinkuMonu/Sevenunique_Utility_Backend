const mongoose = require("mongoose");

const dmtReportSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // User ID
    status: { type: Boolean, required: true },
    ackno: { type: String, required: true },
    referenceid: { type: String, required: true },
    utr: { type: String, required: true },
    txn_status: { type: Number, required: true },
    benename: { type: String, required: true },
    remarks: { type: String },
    message: { type: String },
    remitter: { type: String, required: true },
    account_number: { type: String, required: true },
    gatewayCharges: {
      bc_share: { type: Number, required: true },
      txn_amount: { type: Number, required: true },
      customercharge: { type: Number, default: 0 },
      gst: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      netcommission: { type: Number, default: 0 },
    },
    charges: {
      distributor: { type: Number, default: 0 },
      admin: { type: Number, default: 0 },
    },
    NPCI_response_code: { type: String },
    bank_status: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DmtReport", dmtReportSchema);
