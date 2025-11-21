const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { format, min } = require("date-fns");

const userSchema = new mongoose.Schema(
  {
    UserId: {
      type: String,
      unique: true,
      index: true,
    },

    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    outletId: {
      type: String
    },
    callbackUrl: {
      type: String
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      type: String,
      trim: true,
    },
    businessName: {
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

    shopName: {
      type: String,
      trim: true,
    },
    shopType: {
      type: String,
      trim: true,
    },
    shopAddressProof: {
      type: String,
      trim: true,
    },

    aadhaarFront: {
      type: String,
      default: null
    },
    aadhaarBack: {
      type: String,
      default: null
    },
    panCard: {
      type: String,
      default: null
    },
    bankDocument: {
      type: String,
      default: null
    },
    /** ---------------- DISTRIBUTOR SPECIFIC FIELDS ---------------- **/
    officeAddressProof: {
      type: String, // electricity bill/rent agreement upload
      trim: true,
    },
    references: [
      {
        name: { type: String, required: true },
        mobileNumber: {
          type: String,
          match: /^[6-9]\d{9}$/, // same validation as user mobile
        },
      },
    ],
    educationQualification: {
      type: String, // optional field
      trim: true,
    },
    financialExperience: {
      type: Number, // in years
      min: 0,
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

    planHistory: [
      {
        planId: { type: mongoose.Schema.Types.ObjectId, ref: "ServicePlan" },
        planType: {
          type: String,
          enum: ["monthly", "quarterly", "half-yearly", "yearly"],
        },
        startDate: Date,
        endDate: Date,
        status: {
          type: String,
          enum: ["Active", "expired", "cancelled"],
          default: "active",
        },
      },
    ],
    address: {
      fullAddress: {
        type: String,
        trim: true,
      },
      block: {
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
        default: "India",
        trim: true,
      },
    },
    // API Partner

    apiPartner: {
      companyName: {
        type: String,
        trim: true,
      },
      companyWebsite: {
        type: String,
        trim: true,
      },
      productDescription: {
        type: String,
        trim: true,
      },
      companyType: {
        type: String,
        trim: true,
      },
      gstNumber: {
        type: String,
        trim: true,
      },
      companyPan: {
        type: String,
        trim: true,
      },
      companyCin: {
        type: String,
        trim: true,
      },
      mccCode: {
        type: String,
        trim: true,
      },
      expectedMonthlyTxnVolume: {
        type: String, // or Number if you want numeric values
        trim: true,
      },
      technicalContact: {
        name: {
          type: String,
          trim: true,
        },
        email: {
          type: String,
          trim: true,
          lowercase: true,
          match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },
      },
    },
    directorKycFiles: [
      {
        type: String, // store file URLs/paths
        trim: true,
      },
    ],
    boardResolution: {
      type: String, // store file URL/path
      trim: true,
    },
    rolePermissions: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PermissionByRole",
    },
    extraPermissions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Permission" },
    ],
    restrictedPermissions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Permission" },
    ],

    questions: [
      {
        question: { type: String, required: false },
        answer: { type: String, required: false },
      },
    ],
    pinCode: {
      type: String,
      trim: true,
    },
    isSpecial: {
      type: Boolean,
      default: false,
    },
    registrationProgress: {
      currentStep: { type: Number, default: 1 },
      currentStepTitle: { type: String, default: "Start" },
      status: {
        type: String,
        enum: ["completed", "incomplete"],
        default: "incomplete",
      },
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
    isVideoKyc: {
      type: Boolean,
      default: false,
    },
    agreement: {
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
      enum: [
        "User",
        "Retailer",
        "Distributor",
        "Api Partner",
        "Admin",
        "superAdmin",
        "Sub Admin",
      ],
      default: "User",
    },
    status: {
      type: Boolean,
      default: true,
    },
    cappingMoney: {
      type: Number,
      default: 1000,
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
      set: (v) => {
        const num = Number(v);
        if (isNaN(num)) return v;
        return Number(num.toFixed(2));
      },
    },
    meta: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ✅ isliye method use karte hain
userSchema.methods.getEffectivePermissions = async function () {
  const Permission = mongoose.model("Permission");
  const PermissionByRole = mongoose.model("PermissionByRole");

  let perms = new Set();

  // 1️⃣ superAdmin → sabhi permissions
  if (this.role === "superAdmin") {
    const all = await Permission.find({});
    return all.map((p) => p.key);
  }

  // 2️⃣ rolePermissions (ID ke base par)
  if (this.rolePermissions) {
    const rolePerms = await PermissionByRole.findById(
      this.rolePermissions
    ).populate("permissions", "key");
    if (rolePerms?.permissions?.length) {
      rolePerms.permissions.forEach((p) => perms.add(p.key));
    }
  }

  // 3️⃣ extraPermissions add
  if (this.extraPermissions?.length) {
    const extras = await Permission.find({
      _id: { $in: this.extraPermissions },
    });
    extras.forEach((p) => perms.add(p.key));
  }

  // 4️⃣ restrictedPermissions remove
  if (this.restrictedPermissions?.length) {
    const restricted = await Permission.find({
      _id: { $in: this.restrictedPermissions },
    });
    restricted.forEach((p) => perms.delete(p.key));
  }

  return Array.from(perms);
};

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};
module.exports = mongoose.model("User", userSchema);
