const mongoose = require("mongoose");

const servicePlanSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ["basic", "advance", "standard"],
    required: true,
  },
  services: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
  ],
  amount: [
    {
      type: {
        type: String,
        enum: ["monthly", "quarterly", "half-yearly", "yearly"],
        required: true,
      },
      value: {
        type: Number,
        required: true,
      },
      discountPercent: {
        type: Number,
        default: 0,
      },
      discountedValue: {
        type: Number,
      },
    },
  ],
});

const ServicePlan = mongoose.model("ServicePlan", servicePlanSchema);

module.exports = ServicePlan;
