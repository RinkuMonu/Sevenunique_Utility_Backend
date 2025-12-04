const mongoose = require("mongoose");

const matmTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  txnType: String,
  productCode: String,
  amount: Number,
  charge: Number,
  gst: Number,
  tds: Number,
  mobile: String,
  rrn: String,
  customeridentIfication: String,
  clientRefID: String,
  txnId: String,
  status: String,
  balance_after: Number,
  retailerCommission: Number,
  distributorCommission: Number,
  adminCommission: Number,
  description: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("MatmTransaction", matmTransactionSchema);
