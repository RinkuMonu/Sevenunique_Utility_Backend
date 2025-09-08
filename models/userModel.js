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
    permissions: {
    type: [String],
    default: function () {
      const roleAccess = {
        SuperAdmin: ["company:manage", "user:manage", "wallet:all", "kyc:approve", "reports:view"],
        Admin: ["user:create", "user:view", "wallet:credit", "reports:view"],
        Distributor: ["retailer:create", "wallet:view", "transactions:view"],
        Retailer: ["transactions:create", "wallet:view"]
      };
      return roleAccess[this.role] || [];
    }
  },companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
     
    },
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


module.exports = mongoose.model('User', userSchema);
