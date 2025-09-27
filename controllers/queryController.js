const Form = require("../models/queryModel.js");

// Create a new form submission
exports.createForm = async (req, res) => {
  try {
    const { fullName, email, mobileNumber, regarding, message } = req.body;
    let qureyPhoto = null;
    if (req.file) {
      qureyPhoto = `/uploads/${req.file.filename}`;
    }
    const newForm = new Form({
      userId: req.user.id,
      fullName,
      email,
      mobileNumber,
      regarding,
      message,
      qureyPhoto,
    });

    await newForm.save();
    res.status(201).json({ success: true, data: newForm });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// Get all forms
exports.getAllForms = async (req, res) => {
  try {
    const {
      status,
      from,
      to,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const filter = {};

    // ✅ Role-based filter
    if (req.user.role !== "Admin") {
      filter.userId = req.user.id;
    }

    // ✅ Status filter
    if (status) filter.status = status;

    // ✅ Date filter
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    // ✅ Search filter
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { fullName: regex },
        { email: regex },
        { mobileNumber: regex },
        { regarding: regex },
        { message: regex },
        { enquiryId: regex },
      ];
    }

    // ✅ Pagination & Sorting
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    const [data, total] = await Promise.all([
      Form.find(filter).sort(sortOptions).skip(skip).limit(parseInt(limit)),
      Form.countDocuments(filter),
    ]);

    res.status(200).json({
      flag: 1, // ✅ success flag
      success: true,
      total,
      page: parseInt(page),
      pageSize: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (err) {
    console.error("Error in getAllForms:", err);
    res.status(500).json({
      flag: 0, // ❌ error flag
      success: false,
      error: "Server Error",
    });
  }
};

// Get single form by ID
exports.getFormById = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }
    res.status(200).json({ success: true, data: form });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid ID" });
  }
};

// Update a form
exports.updateForm = async (req, res) => {
  try {
    const form = await Form.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    res.status(200).json({ success: true, data: form });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// Delete a form
exports.deleteForm = async (req, res) => {
  try {
    const form = await Form.findByIdAndDelete(req.params.id);

    if (!form) {
      return res.status(404).json({ success: false, error: "Form not found" });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid ID" });
  }
};
