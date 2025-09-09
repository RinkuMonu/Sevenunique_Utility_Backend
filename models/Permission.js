const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema({
  key: {
    type: String, // e.g. "transactions:refund"
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String, // UI me show karne ke liye e.g. "Refund Transactions"
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model("Permission", permissionSchema);
