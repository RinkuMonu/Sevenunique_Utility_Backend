const mongoose = require("mongoose");

const onboardMailModal = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    formData: {
      type: Object,
      required: true,
    },

    // Batch mail send status
    mailSent: {
      type: Boolean,
      default: false,
    },

    // Batch tracking
    batchId: {
      type: String,
      default: null,
    },

    // Mail kab send hui
    mailSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("onboardModal", onboardMailModal);
