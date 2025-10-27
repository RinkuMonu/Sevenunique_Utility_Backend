const mongoose = require("mongoose");

const LoanCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  svgicon: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  requiredDocs: [{ label: String, key: String }],
});

module.exports = mongoose.model("LoanCategory", LoanCategorySchema);
