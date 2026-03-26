const redis = require("../middleware/redis");
const { invalidateNEWSCache } = require("../middleware/redisValidation");
const News = require("../models/news.model");
const userModel = require("../models/userModel");

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


exports.getUsersForBulkEmail = async (req, res) => {
  try {
    const {
      keyword,
      role,
      status,
      isKycVerified,
      distributorId,
      page = 1,
      limit = 20,
      selectAll = "false",
    } = req.query;

    const andConditions = [];

    // 🔎 Keyword Search
    if (keyword) {
      andConditions.push({
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { email: { $regex: keyword, $options: "i" } },
          { UserId: { $regex: keyword, $options: "i" } },
        ],
      });
    }

    // 🔹 Role Filter
    if (role && role !== "all") {
      andConditions.push({ role });
    }

    // 🔹 Status Filter
    if (status) {
      andConditions.push({ status: status === "true" });
    }

    // 🔹 KYC Filter
    if (isKycVerified) {
      andConditions.push({ isKycVerified: isKycVerified === "true" });
    }

    // 🔹 Distributor Filter
    if (distributorId) {
      andConditions.push({ distributorId });
    }

    const filter =
      andConditions.length > 0 ? { $and: andConditions } : {};

    const skip = (page - 1) * limit;

    // 🔥 If selectAll true → no pagination
    let usersQuery = userModel.find(filter)
      .select("UserId name email role status")
      .sort({ createdAt: -1 });

    if (selectAll !== "true") {
      usersQuery = usersQuery.skip(skip).limit(parseInt(limit));
    }

    const [users, totalUsers] = await Promise.all([
      usersQuery.lean(),
      userModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      totalSelected: selectAll === "true" ? totalUsers : users.length,
      totalUsers,
      pagination:
        selectAll !== "true"
          ? {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalUsers / limit),
          }
          : null,
    });
  } catch (error) {
    console.error("Error in getUsersForBulkEmail:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};


exports.sendBulkEmail = async (req, res) => {
  try {
    const { type, userIds, message } = req.body;

    let users = [];

    if (type === "all") {
      users = await userModel.find({});
    } else {
      users = await userModel.find({ _id: { $in: userIds } });
    }

    if (!users.length) {
      return res.json({ success: false, message: "No users found" });
    }

    const recipients = users.map((user) => ({
      to: [
        {
          name: user.name,
          email: user.email,
        },
      ],
      variables: {
        userName: user.name,
        message: message,
        currentYear: new Date().getFullYear(),
      },
    }));

    const payload = {
      recipients,
      from: {
        name: "Finunique Small Private Limited",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      template_id: "bulk_message_template",
    };

    await axios.post(
      "https://control.msg91.com/api/v5/email/send",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          authkey: process.env.MSG91_AUTH_KEY,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};
