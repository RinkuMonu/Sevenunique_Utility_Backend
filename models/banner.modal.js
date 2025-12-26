const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    bannerUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // 🔹 Banner position on page
    section: {
      type: String,
      enum: ["top", "bottom", "other"],
      required: true,
    },

    // 🔹 Device type
    device: {
      type: String,
      enum: ["mobile", "desktop"],
      required: true,
    },

    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
