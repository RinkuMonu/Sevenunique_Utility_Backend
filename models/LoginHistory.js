const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  mobileNumber: String,
  loginTime: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
  location: {
    lat: String,
    long: String,
    pincode: String,
  },
});

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
