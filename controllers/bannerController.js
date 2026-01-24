import redis from "../middleware/redis.js";
import { invalidateBannerCache } from "../middleware/redisValidation.js";
import Banner from "../models/banner.modal.js";

// CREATE
export const createBanner = async (req, res) => {
  try {
    const { section, device } = req.body;

    if (!section || !device) {
      return res.status(400).json({
        success: false,
        message: "section and device are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Banner image is required",
      });
    }

    const bannerUrl = `/uploads/${req.file.filename}`;

    const banner = await Banner.create({
      bannerUrl,
      section,
      device,
    });
    await invalidateBannerCache()

    res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// READ ALL
export const getAllBanners = async (req, res) => {
  try {
    let cacheKey = null;

    if (redis) {
      try {
        cacheKey = "getAllBanner"
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          // console.log("⚡ Banner REDIS HIT:", cacheKey);
          return res.status(200).json(JSON.parse(cachedData));
        }
        console.log("❌ Banner REDIS MISS:", cacheKey);
      } catch {
        console.log("Redis Banner get failed, fallback to DB");
      }
    }
    const banners = await Banner.find();
    const responseData = {
      success: true,
      data: banners
    };

    if (cacheKey && redis) {
      try {
        await redis.setex(cacheKey, 70000, JSON.stringify(responseData));
        console.log("🔥 Banner DB HIT:", cacheKey);
      } catch (e) {
        console.log("Banner Redis set failed", e.message);
      }
    }
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// export const getAllBanners = async (req, res) => {
//   try {
//     const banners = await Banner.find();

//     res.json(banners);
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

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
    const { section, device, status } = req.body;

    const updateData = {};

    // 🔹 Image update
    if (req.file) {
      updateData.bannerUrl = `/uploads/${req.file.filename}`;
    }

    // 🔹 Optional field updates
    if (section) updateData.section = section;
    if (device) updateData.device = device;
    if (typeof status !== "undefined") updateData.status = status;

    // 🔹 Nothing to update check
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided to update",
      });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true, // ✅ enum validation
      }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }
    await invalidateBannerCache()

    res.json({
      success: true,
      message: "Banner updated successfully",
      data: banner,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


// DELETE
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    await invalidateBannerCache()
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
    await invalidateBannerCache()
    res.json({
      message: `Banner ${status ? "activated" : "deactivated"} successfully`,
      banner,
    });
  } catch (error) {
    console.error("Error toggling banner status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
