const mongoose = require("mongoose");

const servicePlanSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ['basic', 'advance', 'standard'], 
    required: true
  },
  services: {
    type: [String], 
    required: true
  },
  amount: [{
    type: {
      type: String,
      enum: ['monthly', 'quarterly', 'half-yearly', 'yearly'], 
      required: true
    },
    value: {
      type: String,
      required: true
    }
  }]
});

const ServicePlan = mongoose.model('ServicePlan', servicePlanSchema);

module.exports = ServicePlan;