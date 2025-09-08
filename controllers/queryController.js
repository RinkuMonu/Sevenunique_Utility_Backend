const Form = require('../models/queryModel.js');

// Create a new form submission
exports.createForm = async (req, res) => {
  try {
    const { fullName, email, mobileNumber, regarding, message } = req.body;

    const newForm = new Form({
      fullName,
      email,
      mobileNumber,
      regarding,
      message
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
    const forms = await Form.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: forms.length, data: forms });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// Get single form by ID
exports.getFormById = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    res.status(200).json({ success: true, data: form });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
  }
};

// Update a form
exports.updateForm = async (req, res) => {
  try {
    const form = await Form.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
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
      return res.status(404).json({ success: false, error: 'Form not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
  }
};