const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const payOutSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number, // Changed from String to Number for consistency with amounts
      required: true,
      min: [0, 'Amount must be greater than or equal to zero'], // Validation for amount
    },
    reference: {
      type: String,
      required: false,
      unique: true, // Ensuring reference is unique if provided
    },
    trans_mode: {
      type: String,
      required: false,
      enum: ["Bank Transfer", "UPI", "Cash", "Cheque", 'IMPS', 'NEFT', 'WALLET'], // Adding some common payment modes
    },
    account: {
      type: String
    },
    ifsc: {
      type: String,
      required: false,
      match: [/^[A-Za-z]{4}\d{7}$/, 'Invalid IFSC code'], // IFSC code format validation
    },
    name: {
      type: String,
      required: true,
      trim: true, // Trimming whitespace
    },
    mobile: {
      type: String,
      required: true,
      validate: {
        validator: (v) => /\d{10}/.test(v), // Mobile number validation (10 digits)
        message: 'Invalid mobile number',
      },
    },
    email: {
      type: String,
      required: true,
      lowercase: true, // Convert email to lowercase
      match: [/\S+@\S+\.\S+/, 'Please enter a valid email address'], // Email format validation
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed"],
      default: "Pending",
      required: true,
    },
    utr: {
      type: String,
      required: false,
    },
    remark: {
      type: String,
      required: false,
      trim: true, // Trim whitespace from remark
    },

    charges: {
      type: Number, // Changed to Number type for charges
      required: true,
      default: 0, // Default value for charges
      min: [0, 'Charges must be greater than or equal to zero'],
    },
    gst: {
      type: Number,
      default: 0,
    },
    tds: {
      type: Number,
      default: 0,
    },
    totalDebit: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

module.exports = mongoose.model("PayOut", payOutSchema);
