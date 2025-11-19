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
  deviceLocation: {
    type: String,
    default: "N/A",
  },
});

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
