const mongoose = require("mongoose");

const commissionSlabSchema = new mongoose.Schema(
  {
    operator: {
      type: String,
      enum: [
        "airtel",
        "aircel",
        "jio",
        "bsnl",
        "vi",
        "Tata Docomo",
        "idea",
        "vodafone",
        "MTS",
        "MTNL",
        "Tata Indicom",
        "Airtel DTH",
        "Tata Play",
        "Dish TV",
        "d2h",
        "Sun Direct",
      ],
    },
    minAmount: { type: Number },
    maxAmount: { type: Number },
    commissionType: {
      type: String,
      enum: ["flat", "percentage", "slab"],
      default: "flat",
    },
    chargeAmount: {
      type: Number,
    },

    commissionMethod: {
      type: String,
      enum: ["fixed", "percentage", "slab"],
      default: "fixed",
    },
    aepsType: {
      type: String,
      enum: [
        "mini statement",
        "cash withdrawal",
        "cash deposit",
        "balance enquiry",
      ],
    },
    retailer: { type: Number, required: true },
    // type: {
    //   type: String,
    //   // enum: ["commission", "charges"]
    // },
    distributor: { type: Number, required: true },
    admin: { type: Number, default: 0 },
  },
  { _id: false }
);

const commissionPackageSchema = new mongoose.Schema(
  {
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
    dmtPennyDrop: { type: Number, default: 1 },
    aepsOnboarding: { type: Number, default: 0 },
    aepsMiniStatement: { type: Number, default: 0 },
    aepsBalanceEnquiry: { type: Number, default: 0 },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CommissionPackage", commissionPackageSchema);
