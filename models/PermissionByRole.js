const mongoose = require("mongoose");

const permissionByRoleSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["superAdmin", "Admin", "Distributor", "Retailer"],
    required: true,
    unique: true
  },
   permissions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Permission"   // ✅ direct link Permission model se
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("PermissionByRole", permissionByRoleSchema);
