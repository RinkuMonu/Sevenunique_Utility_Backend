const mongoose = require("mongoose");

const RemarkSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DocSchema = new mongoose.Schema(
  {
    name: String, 
    url: String, 
    type: String,
  },
  { _id: false }
);

const LoanLeadSchema = new mongoose.Schema({
  retailerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  loanTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LoanCategory" },
  loanType: { type: String, required: true }, // denormalized name for easy filtering

  customerName: { type: String, required: true, trim: true },
  customerMobile: { type: String, required: true, trim: true },
  customerEmail: { type: String, trim: true },
  customerPAN: { type: String, trim: true },
  customerAadhaar: { type: String, trim: true },

  amountRequested: { type: Number, required: true },
  tenureMonths: { type: Number },
  purpose: { type: String },

  documents: [DocSchema],

  status: {
    type: String,
    enum: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED"],
    default: "PENDING",
  },

  adminNote: { type: String },
  remarks: [RemarkSchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

LoanLeadSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("LoanLead", LoanLeadSchema);
