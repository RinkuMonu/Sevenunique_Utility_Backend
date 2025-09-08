const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 300, 
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OTP", otpSchema);
