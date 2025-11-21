const express = require("express");
const multer = require("multer");
const path = require("path");
const User = require("../models/userModel");
const KYCRequest = require("../models/kycmodels");
const { default: mongoose } = require("mongoose");

const router = express.Router();

// multer config
const storage = multer.diskStorage({
  destination: "/var/www/uploads/",
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });
const axios = require("axios");
const { verifyEmail7Unique } = require("../controllers/authController");

// 1. Request KYC
// router.post("/request", async (req, res) => {
//   console.log(req?.user?.id);

//   const already = await KYCRequest.findOne({ user: req.user.id });

//   if (already) {
//     return res.json({ message: "Request already submited" });
//   }
//   const kyc = await KYCRequest.create({ user: req?.user?.id });
//   await kyc.save();
//   res.json({ message: "KYC requested", kyc });
// });
router.post("/request", async (req, res) => {
  try {
    console.log(req?.user?.id);

    const already = await KYCRequest.findOne({ user: req.user.id });

    if (already) {
      return res.json({ message: "Request already submited" });
    }

    const kyc = await KYCRequest.create({ user: req?.user?.id });
    await kyc.save();

    return res.json({ message: "KYC requested", kyc });
  } catch (error) {
    console.error("Error in /request KYC:", error);
    return res
      .status(500)
      .json({ message: "Server error while processing KYC request" });
  }
});

//send KYC approve mail to user
const sendKYCApprovalEmail = async (user, scheduledTime) => {
  const check = await verifyEmail7Unique(user.email || "");

  if (!check.valid) {
    console.log("Skipping login email. Invalid email:", user.email);
    return;
  }
  try {
    const formattedTime = new Date(scheduledTime).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const payload = {
      recipients: [
        {
          to: [
            {
              name: user?.name || "User",
              email: user?.email,
              // email: "niranjan@7unique.in",
            },
          ],
          variables: {
            company_name: "Finunique Small Private Limited",
            name: user?.name || "User",
            kyc_status: "Approved",
            scheduled_time: formattedTime,
          },
        },
      ],
      from: {
        name: "Finunique KYC Team",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      template_id: "kyc_notification_template",
    };

    const res = await axios.post(
      "https://control.msg91.com/api/v5/email/send",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          authkey: process.env.MSG91_AUTH_KEY,
        },
      }
    );

    console.log("📩 KYC Approval Email Sent:", res.data);
  } catch (error) {
    console.error("❌ Error sending KYC approval email:", error.message);
  }
};
// 2. Approve request (admin)

router.patch("/approve/:id", async (req, res, next) => {
  const { id } = req.params;
  const { scheduledTime } = req.body;
  console.log(scheduledTime);
  console.log(req.body);
  if (!scheduledTime)
    res.json({
      success: false,
      message: "please select metting/room time",
    });
  try {
    const kyc = await KYCRequest.findByIdAndUpdate(
      id,
      {
        status: "approved",
        scheduledTime,
      },
      { new: true }
    );

    const user = await User.findById(kyc.user);
    if (user?.email) {
      await sendKYCApprovalEmail(user, scheduledTime);
    }
    // console.log("user user", user);
    res.json({ success: true, message: "KYC approved and email sent", kyc });
  } catch (Error) {
    console.error("❌ Error approving KYC:", Error);
    next(Error);
  }
});
// 2. complate request (admin)
router.patch("/verify", async (req, res, next) => {
  const { userId, requestId } = req.body;

  try {
    const kyc = await KYCRequest.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(requestId) },
      {
        status: "completed",
      },
      { new: true }
    );

    const user = await User.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId) },
      {
        isVideoKyc: true,
      },
      { new: true }
    );

    res.json({ message: "KYC completed", kyc });
  } catch (Error) {
    next(Error);
  }
});

// location update
router.post("/update-location", async (req, res) => {
  try {
    const { userId, requestId, latitude, longitude, pincode, deviceLocation } = req.body;
    console.log(req.body)
    if (!requestId) {
      return res.status(400).json({ message: "Request ID missing" });
    }

    await KYCRequest.findByIdAndUpdate(
      requestId,
      {
        videoLocation: {
          lat: latitude || null,
          lng: longitude || null,
          pincode: pincode || null,
          deviceLocation: deviceLocation || null
        },
      },
      { new: true }
    );

    res.json({
      message: "Location updated"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});


// 3. Create room (admin)
router.patch("/create-room/:id", async (req, res) => {
  const { id } = req.params;
  const roomLink = `https://meet.jit.si/kyc-room-${id}`;
  const kyc = await KYCRequest.findByIdAndUpdate(
    id,
    {
      roomLink,
      status: "room_created",
    },
    { new: true }
  );
  res.json({ message: "Room created", kyc });
});

// 4. Upload screenshot (agent)
router.post(
  "/upload-screenshot",
  upload.single("screenshot"),
  async (req, res) => {

    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(userId);
    user.documents.push(`uploads/${req.file.filename}`);
    await user.save();

    res.json({ message: "Screenshot uploaded", path: req.file.path });
  }
);

// 5. Get all requests (admin)
router.get("/all", async (req, res) => {
  try {
    const {
      search,
      role,
      status,
      startDate,
      endDate,
      sortField = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };

    // Build match stage
    const matchStage = {};

    if (status) {
      matchStage.status = status;
    }

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          status: 1,
          createdAt: 1,
          scheduledTime: 1,
          roomLink: 1,
          user: {
            _id: 1,
            UserId: "$user.UserId",
            name: "$user.name",
            email: "$user.email",
            mobileNumber: "$user.mobileNumber",
            role: "$user.role",
          },
        },
      },
      { $match: matchStage },
    ];

    // Apply search
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.name": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
            { "user.UserId": { $regex: search, $options: "i" } },
            { "user.mobileNumber": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Filter by role
    if (role) {
      pipeline.push({ $match: { "user.role": role } });
    }

    // Sorting
    pipeline.push({ $sort: sort });

    // Pagination
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    // Execute query
    const data = await KYCRequest.aggregate(pipeline);

    // Total count
    const countPipeline = [...pipeline];
    countPipeline.splice(-2); // remove skip/limit for total count
    const total = await KYCRequest.aggregate(countPipeline).then(
      (res) => res.length
    );

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error("Error fetching KYC Requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/user/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const kyc = await KYCRequest.findOne({ user: id }).sort({ createdAt: -1 }); // In case there are multiple
    console.log("kyc", kyc);
    if (!kyc) {
      return res.status(404).json({ message: "No KYC request found" });
    }

    res.json({ kyc });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;
