const mongoose = require("mongoose");
const LoanCategoryModal = require("../models/LoanCategory.modal");
const LoanLeadModal = require("../models/LoanLead.modal");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

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
        .populate("retailerId", "name mobileNumber email UserId")
        .populate("loanTypeId", "name svgicon")
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


exports.exportLoans = async (req, res) => {
  try {
    const { export: exportType } = req.query;

    // 🔹 same filters jo listing me hain
    const filter = {};
    if (req.query.loanType) filter.loanType = req.query.loanType;
    if (req.query.status) filter.status = req.query.status;

    const loans = await LoanLeadModal.find(filter).sort({ createdAt: -1 }).lean();

    // ================= JSON =================
    if (exportType === "json") {
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=loan-leads.json"
      );
      return res.json(loans);
    }

    // ================= EXCEL =================
    if (exportType === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Loan Leads");

      sheet.columns = [
        { header: "Name", key: "customerName", width: 20 },
        { header: "Mobile", key: "customerMobile", width: 15 },
        { header: "Aadhar No.", key: "customerAadhaar", width: 15 },
        { header: "purpose", key: "purpose", width: 15 },
        { header: "Loan Type", key: "loanType", width: 20 },
        { header: "Amount", key: "amountRequested", width: 15 },
        { header: "Tenure Months", key: "tenureMonths", width: 15 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "createdAt", width: 20 },
      ];

      sheet.addRows(loans);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=loan-leads.xlsx"
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    // ================= PDF =================
    if (exportType === "pdf") {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({
        size: "A4",
        margin: 30,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=loan-leads.pdf"
      );

      doc.pipe(res);

      /* ================= HEADER ================= */
      doc
        .fontSize(16)
        .fillColor("#0C3D4C")
        .text("Loan Leads Report", { align: "center" });

      doc.moveDown(1);

      doc
        .fontSize(10)
        .fillColor("gray")
        .text(`Generated on: ${new Date().toLocaleString()}`, {
          align: "right",
        });

      doc.moveDown(1.5);

      /* ================= TABLE CONFIG ================= */
      const tableTop = doc.y;
      const rowHeight = 18;

      const columns = [
        { label: "No", width: 20 },
        { label: "Name", width: 110 },
        { label: "Mobile", width: 70 },
        { label: "Loan Type", width: 70 },
        { label: "Amount", width: 60 },
        { label: "Status", width: 70 },
        { label: "Created At", width: 140 },
      ];

      let x = doc.page.margins.left;
      let y = tableTop;

      /* ================= TABLE HEADER ================= */
      doc.fontSize(9).fillColor("#ffffff");

      columns.forEach((col) => {
        doc
          .rect(x, y, col.width, rowHeight)
          .fillAndStroke("#018EDE", "#018EDE");

        doc
          .fillColor("#ffffff")
          .text(col.label, x + 3, y + 5, {
            width: col.width - 6,
            align: "left",
          });

        x += col.width;
      });

      y += rowHeight;

      /* ================= TABLE ROWS ================= */
      doc.fontSize(9).fillColor("#000");

      loans.forEach((l, i) => {
        x = doc.page.margins.left;

        const formatIST = (date) => {
          if (!date) return "-";
          return new Date(date).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
        };


        const row = [
          i + 1,
          l.customerName || "-",
          l.customerMobile || "-",
          l.loanType || "-",
          l.amountRequested || 0,
          l.status || "-",
          formatIST(l.createdAt) || "-",
        ];

        row.forEach((cell, idx) => {
          doc
            .rect(x, y, columns[idx].width, rowHeight)
            .stroke();

          doc.text(String(cell), x + 3, y + 5, {
            width: columns[idx].width - 6,
            align: "left",
          });

          x += columns[idx].width;
        });

        y += rowHeight;

        /* ================= PAGE BREAK ================= */
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      });

      doc.end();
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Export failed" });
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
    if (status && invalidTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Sorrry! cannot move from ${currentStatus} → ${status}`,
      });
    }

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
    const { name, requiredDocs, svgicon } = req.body;
    console.log(req.body);

    if (!name || name.trim() === "" || svgicon.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Category name & icon is required" });
    }

    const cat = await LoanCategoryModal.create({
      name: name.trim(),
      requiredDocs: requiredDocs || [],
      svgicon: svgicon || "",
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
