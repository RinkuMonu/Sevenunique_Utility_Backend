const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
    defaultSwitch: {
      type: String,
      enum: ['billAvenue', 'spritVerify', 'Mobikwik',"instantPay"],
      // required: true,
      default: 'spritVerify',
    },
    providers: [],
 
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
