const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender_Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestId: {
      type: String,
      unique: true,
      index: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    mode: {
      type: String,
      enum: {
        values: [
          "UPI",
          "Bank Transfer",
          "NEFT",
          "RTGS",
          "IMPS",
          "Cash",
          "Wallet",
          "Cheque",
          "Card",
          "Other",
        ],
        message: "Invalid payment mode",
      },
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than zero"],
      validate: {
        validator: Number.isFinite,
        message: "{VALUE} is not a valid number",
      },
    },
    description: {
      type: String,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    txnDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ["Pending", "Processing", "Completed", "Failed", "Cancelled"],
        default: "Pending",
      },
      default: "Pending",
      required: true,
    },
    mode: {
      type: String,
      enum: ["debit", "credit"],
    },
    bankDetails: {
      accountName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true, uppercase: true },
      bankName: { type: String, trim: true },
      branch: { type: String, trim: true },
    },
    upiDetails: {
      vpa: { type: String, trim: true, lowercase: true },
    },
    utr: {
      type: String,
      trim: true,
      default: null,
    },
    remark: {
      type: String,
      trim: true,
    },
    transactionSS: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true },
  }
);

paymentRequestSchema.index({ status: 1 });

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

paymentRequestSchema.pre("save", async function (next) {
  const doc = this;
  if (doc.requestId && doc.isNew === false) return next();
  try {
    const now = new Date();
    const dateStr = formatDate(now);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const count = await doc.constructor.countDocuments({
      createdAt: {
        $gte: todayStart,
        $lt: tomorrowStart,
      },
    });
    const seq = count + 1;
    const paddedSeq = String(seq).padStart(3, "0");

    doc.requestId = `REQ-${dateStr}-${paddedSeq}`;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("PaymentRequest", paymentRequestSchema);
