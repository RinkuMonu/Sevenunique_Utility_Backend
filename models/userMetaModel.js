const mongoose = require('mongoose');

const userMetaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    ipWhitelist: {
      type: [String],
      default: [],
      validate: {
        validator: function (ips) {
          return ips.every(ip => typeof ip === 'string');
        },
        message: 'All IPs must be strings',
      },
    },
    services: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
          required: true,
        },
        chargeType: {
          type: String,
          enum: ["fixed", "percentage"],
          required: true,
        },
        serviceCharges: {
          type: Number,
          required: true,
          min: 0,
        },
        gst: {
          type: Number,
          required: true,
          min: 0,
        },
        tds: {
          type: Number,
          required: true,
          min: 0,
        },
        distributorCommission: {
          type: Number,
          required: true,
          min: 0,
        },
        adminCommission: {
          type: Number,
          min: 0,
        },
        status: {
          type: String,
          enum: ["active", "inactive"],
          default: "active",
        },
        _id: false
      },
    ],


    dmtEnabled: {
      type: Boolean,
      default: false,
    },
    aepsEnabled: {
      type: Boolean,
      default: false,
    },
    dmtCommission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionPackage',
    },
    aepsCommission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionPackage',
    },
    mobileCommission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionPackage',
    },
    dthCommission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionPackage',
    },
    preferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('UserMeta', userMetaSchema);
