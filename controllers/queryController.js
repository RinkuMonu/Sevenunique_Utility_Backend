const { default: mongoose } = require("mongoose");
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

    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === "asc" ? 1 : -1 };

    const matchStage = {};

    // ✅ Role-based filter
    if (req.user.role !== "Admin") {
      matchStage.userId = new mongoose.Types.ObjectId(req.user.id);
    }

    // ✅ Status filter
    if (status) matchStage.status = status;

    // ✅ Date filter
    if (from || to) {
      matchStage.createdAt = {};
      if (from) matchStage.createdAt.$gte = new Date(from);
      if (to) matchStage.createdAt.$lte = new Date(to);
    }

    const pipeline = [
      {
        $lookup: {
          from: "users",
          let: { uid: "$userId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
            {
              $project: {
                UserId: 1,
              },
            },
          ],
          as: "user",
        },
      },
      { $unwind: "$user" },
    ];

    // 🔍 SEARCH (Form fields + User Name)
    if (search) {
      const regex = new RegExp(search, "i");
      pipeline.push({
        $match: {
          $or: [
            { fullName: regex },
            { email: regex },
            { mobileNumber: regex },
            { regarding: regex },
            { message: regex },
            { enquiryId: regex },

            // ✅ USER NAME SEARCH
            { "user.UserId": regex },
          ],
        },
      });
    }

    pipeline.push(
      { $match: matchStage },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: Number(limit) }
    );

    const data = await Form.aggregate(pipeline);

    // 🔢 Count
    const countPipeline = pipeline.filter(
      stage => !stage.$skip && !stage.$limit && !stage.$sort
    );
    countPipeline.push({ $count: "total" });

    const countResult = await Form.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pageSize: Number(limit),
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
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
