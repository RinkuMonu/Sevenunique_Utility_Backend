const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    image: { type: String },
    price: { type: Number, required: true },
    gst: { type: Number, default: 18 },
    warranty: { type: String },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DeviceSchema.index({ brand: 1, model: 1 }, { unique: true });

module.exports = mongoose.model("Device", DeviceSchema);
