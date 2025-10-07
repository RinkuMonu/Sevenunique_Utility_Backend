const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  bannerUrl: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);
