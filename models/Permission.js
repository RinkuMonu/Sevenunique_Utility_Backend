const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      // required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    parentKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Permission", permissionSchema);
