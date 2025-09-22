const mongoose = require("mongoose");

const commissionSlabSchema = new mongoose.Schema(
  {
    operator: {
      type: String,
      enum: [
        "airtel",
        "jio",
        "bsnl",
        "vi",
        "Airtel DTH",
        "Tata Play",
        "Dish TV",
        "d2h",
        "Sun Direct",
      ],
    },
    // provider: {
    //   type: String,
    //   enum: [
    //     "billAvenue",
    //     "spritVerify",
    //     "serverMaintenance",
    //     "Mobikwik",
    //     "A2",
    //     "A3",
    //     "A4",
    //     "A5",
    //     "A6",
    //     "A7",
    //     "A8",
    //   ],
    // },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    commissionType: {
      type: String,
      enum: ["flat", "percentage"],
      default: "flat",
    },
    retailer: { type: Number, required: true },
    type: {
      type: String,
      enum: ["commission", "charges"],
      required: true,
    },
    distributor: { type: Number, required: true },
    admin: { type: Number, default: 0 },
  },
  { _id: false }
);

const commissionPackageSchema = new mongoose.Schema(
  {
    // service: {
    //   type: String,
    //   required: true,
    // },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    packageName: { type: String, required: true, unique: true },
    gst: { type: Number, default: 18 },
    tds: { type: Number, default: 5 },
    slabs: [commissionSlabSchema],
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: { type: Boolean, default: true },
    dmtPennyDrop: { type: Number, default: 0 },
    aepsOnboarding: { type: Number, default: 0 },
    aepsMiniStatement: { type: Number, default: 0 },
    aepsBalanceEnquiry: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CommissionPackage", commissionPackageSchema);
