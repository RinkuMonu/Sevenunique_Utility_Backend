const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['Mobile Recharge', 'Dth Recharge', 'AEPS', 'DMT', 'Bus Booking', 'Bill Payment', 'A5', 'A6', 'A7', 'A8'],
      trim: true
    },
    description: {
      type: String,
      default: '',
    },
    icon: {
      type: String,
      required: true,
    },
    serviceFor: {
      type: [String],
      enum: ['User', 'Retailer', 'Distributor', 'ApiPartner', 'Admin'],
      required: true,
    },
    defaultSwitch: {
      type: String,
      enum: ['billAvenue', 'spritVerify', 'Mobikwik', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
      required: true,
      default: 'spritVerify',
    },
    providers: [
      {
        providerName: {
          type: String,
          enum: ['billAvenue', 'spritVerify', 'serverMaintenance', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
          required: true,
          default: 'spritVerify'
        },
        chargeType: {
          type: String,
          enum: ['fixed', 'percentage'],
          required: true,
          default: 'fixed'
        },
        serviceCharges: {
          type: Number,
          required: true,
          min: 0,
        },
        distributorCommission: {
          type: Number,
          required: true,
          min: 0,
        },
        adminCommission:{
          type: Number,
          min: 0,
        },
        gst: {
          type: Number,
          min: 0,
        },
        tds:{
          type: Number,
          min: 0,
        }
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Service', serviceSchema);
