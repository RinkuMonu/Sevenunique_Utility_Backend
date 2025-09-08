const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const payInSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be greater than or equal to zero'], 
    },
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => /\d{10}/.test(v), 
        message: 'Invalid mobile number',
      },
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'Please enter a valid email address'], // Simple email format validation
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed"],
      default: "Pending",
      required: true,
    },
    utr: {
      type: String,
      required: false,
    },
    remark: {
      type: String,
      required: false,
      trim: true,
    },
    charges: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Charges must be greater than or equal to zero'],
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

payInSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("PayIn", payInSchema);
