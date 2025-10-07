import Banner from "../models/banner.modal.js";

// CREATE
export const createBanner = async (req, res) => {
  try {
    const bannerUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const banner = new Banner({ bannerUrl });
    await banner.save();
    res.status(201).json({ success: true, data: banner });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// READ ALL
export const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find();
    res.json(banners);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// READ ONE
export const getBannerById = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    res.json(banner);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE
export const updateBanner = async (req, res) => {
  try {
    const bannerUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const updateData = bannerUrl ? { bannerUrl } : req.body;

    const banner = await Banner.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    res.json(banner);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// TOGGLE ACTIVE/INACTIVE
export const toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const banner = await Banner.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    res.json({
      message: `Banner ${status ? "activated" : "deactivated"} successfully`,
      banner,
    });
  } catch (error) {
    console.error("Error toggling banner status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
