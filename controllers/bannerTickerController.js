import BannerTicker from "../models/bannerTickerSchema.js";

// ✅ CREATE
export const createTicker = async (req, res) => {
  try {
    const { text, redirectType, priority } = req.body;

    const ticker = await BannerTicker.create({
      text,
      redirectType,
      priority,
      logo: `/uploads/${req.file.filename}` || "", 
    });

    res.status(201).json({ success: true, data: ticker });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ✅ GET TICKERS (IMPORTANT API 🔥)
export const getTickers = async (req, res) => {
  try {
    const now = new Date();

    const tickers = await BannerTicker.find().populate("redirectType","name providers").sort({ priority: 1 });

    res.json({ success: true, data: tickers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
// ✅ GET ACTIVE TICKERS (IMPORTANT API 🔥)
export const getActiveTickers = async (req, res) => {
  try {
    const now = new Date();

    const tickers = await BannerTicker.find({
      isActive: true,
      $or: [
        { startDate: { $exists: false } },
        { startDate: { $lte: now } },
      ],
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gte: now } },
      ],
    }).populate("redirectType","name providers").sort({ priority: 1 });

    res.json({ success: true, data: tickers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ✅ UPDATE
export const updateTicker = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.logo = `/uploads/${req.file.filename}`;
    }

    const ticker = await BannerTicker.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({ success: true, data: ticker });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ✅ DELETE
export const deleteTicker = async (req, res) => {
  try {
    await BannerTicker.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};