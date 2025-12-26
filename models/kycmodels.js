const { types, number } = require("joi");
const mongoose = require("mongoose");

const kycRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  videoLocation: {
    lat: Number,
    lng: Number,
    pincode: Number,
    deviceLocation: String
  },
  status: {
    type: String,
    enum: ["pending", "approved", "room_created", "completed"],
    default: "pending",
  },
  scheduledTime: { type: Date },
  roomLink: String,
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});


kycRequestSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === "completed") {
    this.completedAt = new Date();
  }
  next();
});


module.exports = mongoose.model("KYCRequest", kycRequestSchema);



