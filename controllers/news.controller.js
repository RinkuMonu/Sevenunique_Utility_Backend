const redis = require("../middleware/redis");
const { invalidateNEWSCache } = require("../middleware/redisValidation");
const News = require("../models/news.model");

// ✅ Create News
exports.createNews = async (req, res) => {
  try {
    const { title, type, target } = req.body;
    if (!title || !type) {
      return res.status(400).json({
        success: false,
        message: "Title, target and Type are required",
      });
    }

    const news = await News.create({
      title,
      type,
      target,
    });
    await invalidateNEWSCache()
    return res.status(201).json({ success: true, data: news });
  } catch (err) {
    console.error("createNews error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Get All News
exports.getAllNews = async (req, res) => {
  try {
    const { target } = req.query;

    // 🔑 SAFE cache key
    const cacheKey = target ? `news:${target}` : `news:all`;

    if (redis) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch {
        console.log("Redis get failed, fallback to DB");
      }
    }

    const filter = target ? { target } : {};
    const newsList = await News.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const responseData = {
      success: true,
      data: newsList,
    };

    if (redis) {
      try {
        await redis.setex(cacheKey, 20000, JSON.stringify(responseData));
        // console.log("🔥 NEWS DB HIT:", cacheKey);
      } catch (e) {
        console.log("Redis set failed", e.message);
      }
    }

    return res.status(200).json(responseData);
  } catch (err) {
    console.error("getAllNews error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ✅ Get Single News by ID
exports.getNewsById = async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });

    return res.status(200).json({ success: true, data: news });
  } catch (err) {
    console.error("getNewsById error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Update News
exports.updateNews = async (req, res) => {
  try {
    const updatedNews = await News.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updatedNews)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    await invalidateNEWSCache()
    return res.status(200).json({ success: true, data: updatedNews });
  } catch (err) {
    console.error("updateNews error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Delete News
exports.deleteNews = async (req, res) => {
  try {
    const deletedNews = await News.findByIdAndDelete(req.params.id);
    if (!deletedNews)
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    await invalidateNEWSCache()
    return res
      .status(200)
      .json({ success: true, message: "News deleted successfully" });
  } catch (err) {
    console.error("deleteNews error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Get Latest Title (Dashboard)
exports.getDashboardTitle = async (req, res) => {
  try {
    const latest = await News.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select("title");

    return res.status(200).json({
      success: true,
      data: latest ? latest.title : null,
    });
  } catch (err) {
    console.error("getDashboardTitle error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
