const UserMeta = require("../models/userMetaModel.js");
const mongoose = require("mongoose");
const User = require("../models/userModel.js");
const servicesModal = require("../models/servicesModal.js");

// 🔹 Create or Update UserMeta
// exports.upsertUserMeta = async (req, res) => {
//   console.log(".............",req.body);

//   const {
//     userId,
//     ipWhitelist,
//     services,
//     preferences,
//     dmtEnabled,
//     aepsEnabled,
//     dmtCommission,
//     // aepsCommission
//   } = req.body;

//   try {
//     let userMeta = await UserMeta.findOne({ userId });

//     if (!userMeta) {
//       userMeta = await UserMeta.create({
//         userId,
//         ipWhitelist,
//         services,
//         preferences,
//         dmtEnabled,
//         aepsEnabled,
//         dmtCommission,
//         aepsCommission
//       });
//     } else {
//       userMeta.ipWhitelist = ipWhitelist ?? userMeta.ipWhitelist;
//       userMeta.preferences = preferences ?? userMeta.preferences;
//       // userMeta.services = services ?? userMeta.services;

//       if (dmtEnabled !== undefined) userMeta.dmtEnabled = dmtEnabled;
//       if (aepsEnabled !== undefined) userMeta.aepsEnabled = aepsEnabled;
//       // if (dmtCommission) userMeta.dmtCommission = dmtCommission;
//       // if (aepsCommission) userMeta.aepsCommission = aepsCommission;

//       await userMeta.save();
//     }

//     res.json({ success: true, data: userMeta });
//   } catch (err) {
//     console.error("Error in upsertUserMeta:", err);
//     res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

exports.upsertUserMeta = async (req, res) => {
  console.log(".............", req.body);
  const {
    userId,
    ipWhitelist,
    services,
    preferences,
    dmtEnabled,
    aepsEnabled,
  } = req.body;

  try {
    const serviceFind = await servicesModal.findOne({ name: services[0].service })
    if (!serviceFind) {
      return res.status(500).json({ message: "Service not found" }); 
    }

    let userMeta = await UserMeta.findOne({ userId });

    if (!userMeta) {
      userMeta = await UserMeta.create({
        userId,
        ipWhitelist,
        services: {
          serviceId: serviceFind._id,
          packageId: services.packageId,
        },
        preferences,
        dmtEnabled,
        aepsEnabled,
      });
    } else {
      userMeta.ipWhitelist = ipWhitelist ?? userMeta.ipWhitelist;
      userMeta.preferences = preferences ?? userMeta.preferences;
      userMeta.services = services ?? userMeta.services;
      if (dmtEnabled !== undefined) userMeta.dmtEnabled = dmtEnabled;
      if (aepsEnabled !== undefined) userMeta.aepsEnabled = aepsEnabled;
      await userMeta.save();
    }

    res.json({ success: true, data: userMeta });
  } catch (err) {
    console.error("Error in upsertUserMeta:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔹 Get Single UserMeta by userId
exports.getUserMeta = async (req, res) => {
  try {
    const { userId } = req.params;

    const userMeta = await UserMeta.findOne({ userId })
      // .populate("services.serviceId")
      .populate("dmtCommission")
      .populate("aepsCommission")
      .populate("mobileCommission")
      .populate("dthCommission");

    if (!userMeta) {
      return res
        .status(404)
        .json({ success: false, message: "UserMeta not found" });
    }

    res.json({ success: true, data: userMeta });
  } catch (err) {
    console.error("Error in getUserMeta:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔹 Remove a service entry from userMeta
exports.removeUserService = async (req, res) => {
  const { userId, serviceId } = req.body;

  try {
    const result = await UserMeta.findOneAndUpdate(
      { userId },
      {
        $pull: {
          services: { serviceId: new mongoose.Types.ObjectId(serviceId) },
        },
      },
      { new: true }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error in removeUserService:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔹 Get All UserMeta with pagination and filters
exports.getAllUserMeta = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      userId,
      serviceId,
      chargeType,
      ip,
      hasService,
      startDate,
      endDate,
    } = req.query;

    const filter = {};

    if (userId) {
      filter.userId = new mongoose.Types.ObjectId(userId);
    }

    if (serviceId || chargeType) {
      filter.services = {
        $elemMatch: {
          ...(serviceId && {
            serviceId: new mongoose.Types.ObjectId(serviceId),
          }),
          ...(chargeType && { chargeType }),
        },
      };
    }

    if (ip) {
      filter.ipWhitelist = ip;
    }

    if (hasService === "true") {
      filter["services.0"] = { $exists: true };
    } else if (hasService === "false") {
      filter["services"] = { $size: 0 };
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await UserMeta.countDocuments(filter);

    const data = await UserMeta.find(filter)
      // .populate("services.serviceId")
      .populate("dmtCommission")
      .populate("aepsCommission")
      .populate("mobileCommission")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error("Error in getAllUserMeta:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.acceptAgreement = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { agreement: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Agreement accepted successfully",
    });
  } catch (error) {
    console.error("Error accepting agreement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
