const mongoose = require("mongoose");
 
const kycRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["pending", "approved", "room_created", "completed"], default: "pending" },
  scheduledTime: Date,
  roomLink: String,
  createdAt: { type: Date, default: Date.now }
});
 
module.exports = mongoose.model("KYCRequest", kycRequestSchema);