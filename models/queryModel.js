const mongoose = require("mongoose");

const formSchema = new mongoose.Schema({
  enquiryId: {
    type: String,
    required: true,
    unique: true
  },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  regarding: {
    type: String,
    required: true,
    enum: ['Inquiry', 'Support', 'Feedback', 'Complaint', 'Distributor Registration', 'Retailer Registration', 'Other']
  },
  message: { type: String, default: "" },
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved', 'Closed'],
    default: 'Pending'
  }
}, {
  timestamps: true
});

formSchema.pre('validate', async function(next) {
  const doc = this;
  if (!doc.isNew) return next();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const count = await mongoose.models.Form.countDocuments({
    submittedAt: {
      $gte: todayStart,
      $lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    }
  });
  const seq = count + 1;
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); 
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const paddedSeq = String(seq).padStart(3, '0');
  doc.enquiryId = `ENQ-${dateStr}-${paddedSeq}`;
  next();
});

const Form = mongoose.model("Form", formSchema);

module.exports = Form;
