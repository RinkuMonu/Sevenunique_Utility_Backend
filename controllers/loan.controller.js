const mongoose = require("mongoose");
const LoanCategoryModal = require("../models/LoanCategory.modal");
const LoanLeadModal = require("../models/LoanLead.modal");

// Retailer: create a lead for loan
exports.createLead = async (req, res) => {
  try {
    const {
      loanTypeId,
      loanType,
      customerName,
      customerMobile,
      customerEmail,
      customerPAN,
      customerAadhaar,
      amountRequested,
      tenureMonths,
      purpose,
    } = req.body;

    let finalLoanType = loanType;
    let finalLoanTypeId = loanTypeId;

    if (loanTypeId && !loanType) {
      const cat = await LoanCategoryModal.findById(loanTypeId);
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid loanTypeId" });
      finalLoanType = cat.name;
      finalLoanTypeId = cat._id;
    }

    // documents → multer se aayenge
    const docs = (req.files || []).map((f) => ({
      name: f.originalname,
      url: `/uploads/${f.filename}`,
      type: f.mimetype,
    }));

    const lead = await LoanLeadModal.create({
      retailerId: req.user.id,
      loanType: finalLoanType,
      loanTypeId: finalLoanTypeId,
      customerName,
      customerMobile,
      customerEmail,
      customerPAN,
      customerAadhaar,
      amountRequested,
      tenureMonths,
      purpose,
      documents: docs,
    });

    return res.json({ success: true, data: lead });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Retailer: my loan leads
exports.getMyLeads = async (req, res) => {
  try {
    const filter = req.query;
    filter.retailerId = req.user.id; // enforce own leads

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
      LoanLeadModal.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit),
      LoanLead.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin: list all losn leads with advanced filters + pagination
exports.listLeads = async (req, res) => {
  try {
    const filter = {};

    // if (req.user.role !== "Admin") {
    //   filter.retailerId = req.user.id;
    // }
    if (req.user.role !== "Admin") {
      filter.retailerId = new mongoose.Types.ObjectId(req.user.id);
    }
    if (req.query.q) {
      const regex = new RegExp(req.query.q, "i");
      filter.$or = [
        { customerName: regex },
        { customerMobile: regex },
        { customerEmail: regex },
      ];
    }

    if (req.query.loanType) {
      filter.loanTypeId = req.query.loanType;
    }

    if (req.query.status || req.query.statuses) {
      filter.status = req.query.status || req.query.statuses;
    }

    // ✅ date range
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) {
        filter.createdAt.$gte = new Date(req.query.from);
      }
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // ✅ pagination + sorting
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
      LoanLeadModal.find(filter)
        .populate("retailerId", "name mobileNumber email")
        .populate("loanTypeId", "name")
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit),
      LoanLeadModal.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getLeadById = async (req, res) => {
  try {
    const lead = await LoanLeadModal.findById(req.params.id)
      .populate("retailerId", "name mobileNumber email")
      .populate("loanTypeId", "name");
    if (!lead)
      return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: lead });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

// Admin: update status + note + optional remark append
exports.updateLead = async (req, res) => {
  try {
    const { status, adminNote, remark } = req.body;

    const lead = await LoanLeadModal.findById(req.params.id);
    if (!lead)
      return res.status(404).json({ success: false, message: "Not found" });

    // ✅ Define invalid transitions
    const invalidTransitions = {
      REJECTED: ["PENDING", "UNDER_REVIEW", "APPROVED", "DISBURSED"],
      APPROVED: ["PENDING", "UNDER_REVIEW", "REJECTED"],
      DISBURSED: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"],
    };

    const currentStatus = lead.status;
    // only check if status is being changed
    if (status && invalidTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status change: cannot move from ${currentStatus} → ${status}`,
      });
    }

    // ✅ Apply updates (only if allowed)
    if (status) lead.status = status;
    if (adminNote !== undefined) lead.adminNote = adminNote;
    if (remark) {
      lead.remarks.push({
        by: req.user?.id || "System",
        note: remark,
        at: new Date(),
      });
    }

    await lead.save();

    return res.json({ success: true, data: lead });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
};

// Admin: categories
exports.getCategories = async (req, res) => {
  try {
    const cats = await LoanCategoryModal.find({ isActive: true }).sort({
      name: 1,
    });
    return res.json({ success: true, data: cats });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, requiredDocs } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required" });
    }

    const cat = await LoanCategoryModal.create({
      name: name.trim(),
      requiredDocs: requiredDocs || [],
    });

    return res.json({ success: true, data: cat });
  } catch (e) {
    console.error(e);
    if (e.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
