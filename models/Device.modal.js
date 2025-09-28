const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true, trim: true }, // e.g. Mantra, Morpho
    model: { type: String, required: true, trim: true }, // e.g. L0, L1
    image: { type: String }, // URL
    price: { type: Number, required: true },
    warranty: { type: String }, // "1 Year"
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DeviceSchema.index({ brand: 1, model: 1 }, { unique: true });

module.exports = mongoose.model("Device", DeviceSchema);
