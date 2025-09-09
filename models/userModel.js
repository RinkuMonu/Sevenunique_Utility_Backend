const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { format, min } = require('date-fns');

const userSchema = new mongoose.Schema(
  {
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true,
    },
  
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    }, businessName: {
      type: String,
      trim: true,
    },
    businessType: {
      type: String,
      trim: true,
    },
   shopPhoto: {
  type: [String], // ✅ Array of strings now
  trim: true,
},
    ownerPhoto: {
      type: String, // yahan owner photo ka URL save hoga
      trim: true,
    },
    plan: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ServicePlan",
        default: null,
      },
      planType: {
        type: String,
        enum: ["monthly", "quarterly", "half-yearly", "yearly"],
        default: null,
      },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
    },
    address: {
      fullAddress: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      }, 
      country: {
        type: String,
        default: 'India',
        trim: true,
      }
    },
 rolePermissions: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PermissionByRole"
  },
 extraPermissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
restrictedPermissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],

    questions: [
    {
      question: { type: String, required: true },
      answer: { type: String, required: true }
    }
  ],
    pinCode: {
      type: String,
      trim: true,
    },
    isSpecial: {
      type: Boolean,
      default: false
    },
    documents: [String],
    mpin: {
      type: Number,
      required: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[6-9]\d{9}$/,
    },
    isKycVerified: {
      type: Boolean,
      default: false,
    },
    
    panDetails: {
      type: Object,
      required: false,
    },
    bankDetails: {
     type: Object,
      required: false,
    },
    aadharDetails: {
      type: Object,
      required: false,
    },
    role: {
      type: String,
      enum: ['User', 'Retailer', 'Distributor', 'ApiPartner', 'Admin', 'superAdmin'],
      default: 'User',
    },
    status: {
      type: Boolean,
      default: false,
    },
    cappingMoney: {
      type: Number,
      default: 0,
    },
    mainWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    eWallet: {
      type: Number,
      default: 0,
      min: 0,
      set: v => {
        const num = Number(v);
        if (isNaN(num)) return v;
        return Number(num.toFixed(2));
      }
    },
    meta: {
      type: Map,
      of: String,
      default: {},
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

// ❌ virtual me async problem deta hai (JSON me {} aata hai)
// ✅ isliye method use karte hain
userSchema.methods.getEffectivePermissions = async function () {
  const Permission = mongoose.model("Permission");
  const PermissionByRole = mongoose.model("PermissionByRole");

  let perms = new Set();

  // 1️⃣ superAdmin → sabhi permissions
  if (this.role === "superAdmin") {
    const all = await Permission.find({});
    return all.map(p => p.key);
  }

  // 2️⃣ rolePermissions (ID ke base par)
  if (this.rolePermissions) {
    const rolePerms = await PermissionByRole.findById(this.rolePermissions)
      .populate("permissions", "key");
    if (rolePerms?.permissions?.length) {
      rolePerms.permissions.forEach(p => perms.add(p.key));
    }
  }

  // 3️⃣ extraPermissions add
  if (this.extraPermissions?.length) {
    const extras = await Permission.find({ _id: { $in: this.extraPermissions } });
    extras.forEach(p => perms.add(p.key));
  }

  // 4️⃣ restrictedPermissions remove
  if (this.restrictedPermissions?.length) {
    const restricted = await Permission.find({ _id: { $in: this.restrictedPermissions } });
    restricted.forEach(p => perms.delete(p.key));
  }

  return Array.from(perms);
};


module.exports = mongoose.model('User', userSchema);
