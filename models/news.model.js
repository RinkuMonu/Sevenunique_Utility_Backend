const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      enum: ["header", "notification", "both"],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("News", newsSchema);
