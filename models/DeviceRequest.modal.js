const mongoose = require("mongoose");
const { Schema } = mongoose;

const DeviceRequestSchema = new Schema(
  {
    retailerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    quantity: { type: Number, default: 1, min: 1 },
    address: { type: String, required: true },
    remarks: { type: String },
    amount: { type: Number },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SHIPPED", "DELIVERED"],
      default: "PENDING",
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    adminNote: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeviceRequest", DeviceRequestSchema);
