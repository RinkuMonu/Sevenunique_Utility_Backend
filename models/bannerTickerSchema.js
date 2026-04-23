// models/bannerTickerModel.js

const mongoose = require("mongoose");

const bannerTickerSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },

    logo: {
      type: String,
    },

    redirectType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      index: true,
      default: null,
    },

    priority: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    startDate: Date,
    endDate: Date,
  },
  { timestamps: true },
);

const BannerTicker = mongoose.model("BannerTicker", bannerTickerSchema);
module.exports = BannerTicker;
