const mongoose = require("mongoose");

const permissionByRoleSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true, // ek hi role duplicate na ho
      trim: true
    },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission"
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("PermissionByRole", permissionByRoleSchema);

