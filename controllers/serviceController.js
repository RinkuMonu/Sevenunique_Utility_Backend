const { default: axios } = require("axios");
const Service = require("../models/servicesModal.js");
const mongoose = require("mongoose");
const Transaction = require("../models/transactionModel.js");
const userModel = require("../models/userModel.js");

// exports.upsertService = async (req, res) => {
//   const {
//     name,
//     description,
//     icon,
//     serviceFor,
//     defaultSwitch,
//     providers,
//   } = req.body;

//   try {
//     let service = await Service.findOne({ name });

//     if (service) {
//       service.description = description || service.description;
//       service.icon = icon || service.icon;
//       service.serviceFor = serviceFor || service.serviceFor;
//       service.defaultSwitch = defaultSwitch || service.defaultSwitch;

//       const providerMap = service.providers.reduce((acc, p) => {
//         acc[p.providerName] = p;
//         return acc;
//       }, {});

//       for (const incoming of providers) {
//         if (providerMap[incoming.providerName]) {
//           Object.assign(providerMap[incoming.providerName], incoming);
//         } else {
//           service.providers.push(incoming);
//         }
//       }

//       await service.save();
//     } else {
//       service = await Service.create({
//         name,
//         description,
//         icon,
//         serviceFor,
//         defaultSwitch,
//         providers,
//       });
//     }

//     res.json({ success: true, data: service });
//   } catch (err) {
//     console.error("Error in upsertService:", err);
//     res.status(500).json({ success: false, message: "Internal Server Error" });
//   }
// };

exports.upsertService = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      serviceFor,
      defaultSwitch,
      isActive,
      category,
      providers, // this can be an array of provider names from your form
    } = req.body;

    // normalize providers (if user sends string instead of array)
    const providerList = Array.isArray(providers)
      ? providers
      : providers
      ? [providers]
      : [];
    let service;
    if (req.query.id) {
      service = await Service.findOne({
        _id: new mongoose.Types.ObjectId(req.query.id),
      });

      if (service) {
        // update existing
        service.name = name || service.name;
        service.description = description || service.description;
        service.icon = icon || service.icon;
        // service.serviceFor = serviceFor || service.serviceFor;
        service.defaultSwitch = defaultSwitch || service.defaultSwitch;
        service.isActive = isActive || service.isActive;
        service.category = category || service.category;

        // Replace providers fully from form input
        service.providers = providerList;

        await service.save();
      }
    } else {
      // create new
      service = await Service.create({
        name,
        description,
        icon,
        // serviceFor,
        defaultSwitch,
        isActive,
        category,
        providers: providerList,
      });
    }

    res.json({ success: true, data: service });
  } catch (err) {
    console.error("Error in upsertService:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    let { page = 1, limit, isActive, providerName, name } = req.query;

    const filter = {};

    if (name) filter.name = new RegExp(name, "i");
    if (isActive !== undefined) filter.isActive = isActive === "true";

    if (providerName) {
      filter.defaultSwitch = { $regex: providerName, $options: "i" };
    }

    page = parseInt(page);
    limit = limit ? parseInt(limit) : null;

    const skip = limit ? (page - 1) * limit : 0;

    const total = await Service.countDocuments(filter);
    console.log("Total services found:", total);
    let query = Service.find(filter).sort({ createdAt: -1 });

    if (limit) {
      query = query.skip(skip).limit(limit);
    }

    const services = await query;

    res.json({
      success: true,
      total,
      page,
      pages: limit ? Math.ceil(total / limit) : 1,
      data: services,
    });
  } catch (err) {
    console.error("Error in getAllServices:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    console.error("Error in getServiceById:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    res.json({ success: true, message: "Service deleted" });
  } catch (err) {
    console.error("Error in deleteService:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.setServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, defaultSwitch } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }
    if (service.isActive === isActive) {
      return res.status(200).json({
        success: true,
        message: `Service is already ${isActive ? "Active" : "Inactive"}`,
        data: { id: service._id, isActive: service.isActive },
      });
    }
    service.isActive = isActive;

    if (defaultSwitch) {
      service.defaultSwitch = defaultSwitch;
    }
    await service.save();

    return res.status(200).json({
      success: true,
      message: `Service status set to ${isActive ? "Active" : "Inactive"}`,
      data: { id: service._id, isActive: service.isActive },
    });
  } catch (error) {
    console.error("Error in setServiceStatus:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getCreditScore = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, mobile, pan } = req.body;
    if (!name || !mobile || !pan) {
      throw new Error("Name, Mobile and PAN are required");
    }
    const userId = req.user.id;
    // 1️⃣ Validate user
    const user = await userModel.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    const chargeAmount = 30;
    if (user.eWallet < chargeAmount) {
      throw new Error("Insufficient wallet balance");
    }

    // 2️⃣ Deduct wallet balance
    const currentBalance = Number(user.eWallet) || 0;
    const updatedBalance = currentBalance - chargeAmount;
    user.eWallet = updatedBalance;
    await user.save({ session });

    // 3️⃣ Create transaction record
    const transactionRef = `CibilScore-${Date.now()}`;
    const transaction = new Transaction({
      user_id: user._id,
      sender_Id: user._id,
      type2: "CIBIL Score Check",
      transaction_type: "debit",
      amount: chargeAmount,
      totalDebit: chargeAmount,
      balance_after: updatedBalance,
      status: "Success",
      payment_mode: "wallet",
      transaction_reference_id: transactionRef,
      description: `CIBIL Score Check for PAN ${pan}`,
      meta: { source: "CibilScoreCheck" },
    });

    await transaction.save({ session });

    // 4️⃣ Call Experian API
    const apiResponse = await axios.post(
      "https://api.7uniqueverfiy.com/api/verify/credit-report-experian/fetch-report-pdf",
      {
        consent: "Y",
        mobile,
        name,
        pan,
      },
      {
        headers: {
          token:
            "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiI2ODQ3ZDBkZmM4MGZmNTJhMWU4ZjhjZTciLCJlbWFpbCI6ImNoYW5kdUBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4ifQ.B1RbPjRkdKAZVdbn6kDlY9_mjmxT4fA5vJwgILEiDYA",
          "client-id": "Seven012",
          "x-env": "production",
          "Content-Type": "application/json",
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiI2ODQ3ZDBkZmM4MGZmNTJhMWU4ZjhjZTciLCJlbWFpbCI6ImNoYW5kdUBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4ifQ.B1RbPjRkdKAZVdbn6kDlY9_mjmxT4fA5vJwgILEiDYA",
        },
      }
    );

    // 5️⃣ Commit transaction
    await session.commitTransaction();
    session.endSession();

    // 6️⃣ Return score (only data, not pdf)
    return res.status(200).json({
      success: true,
      message: "CIBIL score fetched successfully",
      data: apiResponse.data, // frontend me score dikhane ke liye
      wallet_balance: updatedBalance,
      transaction_ref: transactionRef,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in getCreditScore:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
