const Transaction = require("../models/transactionModel");
const planService = require("../services/servicePlanService");
const ServicePlan = require("../models/servicePlanmodel");
const userModel = require("../models/userModel");
const servicesModal = require("../models/servicesModal");
const { default: mongoose } = require("mongoose");

const createPlan = async (req, res) => {
  try {
    let { name, services, amount, discountPercent = 0 } = req.body;

    // ✅ Validate plan name
    if (!name || !["basic", "advance", "standard"].includes(name)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid plan name" });
    }

    // ✅ Validate services
    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Services must be an array and cannot be empty",
      });
    }

    // ✅ Validate amount array
    if (!Array.isArray(amount) || amount.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be an array and cannot be empty",
      });
    }

    amount = amount.map((item) => {
      const val = Number(item.value);
      if (isNaN(val)) {
        throw new Error(`Amount value must be a number for type: ${item.type}`);
      }
      if (
        !item.type ||
        !["monthly", "quarterly", "half-yearly", "yearly"].includes(item.type)
      ) {
        throw new Error(`Invalid type in amount: ${item.type}`);
      }
      return {
        type: item.type,
        value: val,
        discountPercent: item.discountPercent
          ? Number(item.discountPercent)
          : 0, // ✅ add this
      };
    });

    // ✅ Calculate discountedValue for each amount
    const amountWithDiscount = amount.map((item) => {
      const originalValue = Number(item.value);
      const discount = item.discountPercent ? Number(item.discountPercent) : 0;
      const discountedValue = originalValue - (originalValue * discount) / 100;
      return {
        type: item.type,
        value: originalValue,
        discountPercent: discount,
        discountedValue: Number(discountedValue.toFixed(2)),
      };
    });

    const planData = {
      name,
      services,
      discountPercent,
      amount: amountWithDiscount,
    };

    const existingPlan = await ServicePlan.findOne({ name });

    if (existingPlan) {
      const updatedPlan = await ServicePlan.findByIdAndUpdate(
        existingPlan._id,
        planData,
        { new: true }
      );
      return res.status(200).json({
        success: true,
        message: "Plan updated successfully",
        data: updatedPlan,
      });
    } else {
      const newPlan = new ServicePlan(planData);
      await newPlan.save();
      return res.status(201).json({
        success: true,
        message: "Plan created successfully",
        data: newPlan,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllPlans = async (req, res) => {
  try {
    const plans = await planService.getAllPlans();
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getPlanById = async (req, res) => {
  try {
    const { id } = req.params; // Getting ID from URL parameter
    const plan = await planService.getPlanById(id);
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, services, amount } = req.body;

    // Fetch the existing plan
    const existingPlan = await planService.getPlanById(id);
    if (!existingPlan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    // Prepare updated data
    const updatedPlanData = {
      name: name ?? existingPlan.name,
      services: services?.length ? services : existingPlan.services,
      amount: existingPlan.amount.map((oldItem) => {
        // Find matching amount item from request by type
        const newItem = amount?.find((a) => a.type === oldItem.type);

        if (newItem) {
          const valueNum = Number(newItem.value ?? oldItem.value);
          const discount = Number(
            newItem.discountPercent ?? oldItem.discountPercent ?? 0
          );

          return {
            type: oldItem.type,
            value: valueNum,
            discountPercent: discount,
            discountedValue: Number(
              (valueNum - (valueNum * discount) / 100).toFixed(2)
            ),
          };
        }

        return oldItem; // keep old value if not updated
      }),
    };

    // If there are new amount types that didn’t exist before, add them
    if (amount?.length) {
      amount.forEach((newItem) => {
        if (!existingPlan.amount.some((a) => a.type === newItem.type)) {
          const valueNum = Number(newItem.value);
          const discount = Number(newItem.discountPercent ?? 0);
          updatedPlanData.amount.push({
            type: newItem.type,
            value: valueNum,
            discountPercent: discount,
            discountedValue: Number(
              (valueNum - (valueNum * discount) / 100).toFixed(2)
            ),
          });
        }
      });
    }

    // Update and save plan
    const updatedPlan = await planService.updatePlan(id, updatedPlanData);

    res.status(200).json({ success: true, data: updatedPlan });
  } catch (error) {
    console.error("Error updating plan:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPlan = await planService.deletePlan(id);
    res.status(200).json({ success: true, data: deletedPlan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const buyPlan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, planType, force = false } = req.body;
    const userId = req.user.id;

    // 1. Plan fetch karo
    const plan = await ServicePlan.findById(planId).session(session);
    if (!plan) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    const selectedAmount = plan.amount.find((a) => a.type === planType);
    if (!selectedAmount) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid plan type" });
    }

    // 2. Final price calculate
    const discountPercent =
      selectedAmount.discountPercent ?? plan.discountPercent ?? 0;

    const planPrice =
      selectedAmount.discountedValue ??
      Math.round(
        selectedAmount.value - (selectedAmount.value * discountPercent) / 100
      );
    // 3. User fetch karo
    const userfind = await userModel.findById(userId).session(session);
    if (!userfind) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);

    const hasPlanId = !!userfind?.plan?.planId;
    const end0 = userfind?.plan?.endDate
      ? new Date(userfind.plan.endDate)
      : null;
    if (end0) end0.setHours(0, 0, 0, 0);

    const hasActivePlan = hasPlanId && end0 && end0 >= today0;

    const remainingDaysCurrent = hasActivePlan
      ? Math.max(0, Math.floor((end0 - today0) / (1000 * 60 * 60 * 24)))
      : 0;

    if (hasActivePlan && !force) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        requiresConfirmation: true,
        message: `Aapka current plan abhi active hai . Kya aap ise cancel karke naya plan lena chahte hain?`,
        currentPlan: {
          planId: userfind.plan.planId,
          planType: userfind.plan.planType,
          startDate: userfind.plan.startDate,
          endDate: userfind.plan.endDate,
          remainingDays: remainingDaysCurrent,
        },
      });
    }
    const updatedUser = await userModel.findOneAndUpdate(
      { _id: userId, eWallet: { $gte: planPrice } },
      { $inc: { eWallet: -planPrice } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Insufficient wallet balance" });
    }
    // 6. Plan dates calculate
    const startDate = new Date();
    let endDate = new Date(startDate);
    switch (planType) {
      case "monthly":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "quarterly":
        endDate.setMonth(endDate.getMonth() + 3);
        endDate.setDate(endDate.getDate() - 1);
        break;
      case "half-yearly":
        endDate.setMonth(endDate.getMonth() + 6);
        endDate.setDate(endDate.getDate() + 1);
        break;
      case "yearly":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // ... endDate calculate ho chuka

    const updates = {
      $set: {
        plan: {
          planId: plan._id,
          planType,
          startDate,
          endDate,
        },
      },
    };

    if (userfind.plan && userfind.plan.planId) {
      updates.$push = {
        planHistory: {
          planId: userfind.plan.planId,
          planType: userfind.plan.planType,
          startDate: userfind.plan.startDate,
          endDate: userfind.plan.endDate,
          status: "cancelled",
        },
      };
    }

    await userModel.updateOne({ _id: userId }, updates, { session });

    const transactionRef = `PLAN-${Date.now()}`;
    const transaction = new Transaction({
      user_id: updatedUser._id,
      sender_Id: updatedUser._id, // khud ka wallet debit hua
      transaction_type: "debit",
      type: planId,
      amount: planPrice,
      totalDebit: planPrice,
      balance_after: updatedUser.eWallet,
      status: "Success",
      payment_mode: "wallet",
      transaction_reference_id: transactionRef,
      description: `Plan purchase: ${plan.name} (${planType})`,
      meta: {
        source: "PlanPurchase",
      },
    });
    await transaction.save({ session });

    // 12. Commit transaction
    await session.commitTransaction();
    session.endSession();

    const remainingDays = Math.floor(
      (new Date(endDate).setHours(0, 0, 0, 0) -
        new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      success: true,
      message: "Plan activated successfully",
      PLAN: {
        planId: plan._id,
        planName: plan.name,
        planType,
        price: selectedAmount.value,
        discountPercent,
        finalPrice: planPrice,
        startDate,
        endDate,
        remainingDays,
        walletBalance: updatedUser.eWallet,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// get buy service

const getUserBuyServices = async (req, res) => {
  console.log(req.user);
  try {
    const user = await userModel.findById(req.user.id).populate("plan.planId");
    if (!user || !user.plan?.planId) {
      return res
        .status(404)
        .json({ success: false, message: "No active plan found" });
    }

    const today = new Date();
    if (user.plan.endDate && today > user.plan.endDate) {
      return res
        .status(403)
        .json({ success: false, message: "Your plan has expired" });
    }

    // fetch services included in plan
    const plan = await ServicePlan.findById(user.plan.planId).populate(
      "services"
    );
    return res.status(200).json({
      success: true,
      plan: {
        name: plan.name,
        type: user.plan.planType,
        startDate: user.plan.startDate,
        endDate: user.plan.endDate,
      },
      services: plan.services,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

//buypass

const buyPassPlan = async (req, res) => {
  try {
    const { userIds, planId, planType, applyToAll = false } = req.body;

    const plan = await ServicePlan.findById(planId);
    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    const selectedAmount = plan.amount.find((a) => a.type === planType);
    if (!selectedAmount) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid plan type" });
    }

    const startDate = new Date();
    let endDate = new Date(startDate);

    switch (planType) {
      case "monthly":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "quarterly":
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case "half-yearly":
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case "yearly":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    let users;
    if (applyToAll) {
      // ✅ Saare Active users ko fetch karo
      users = await userModel.find({ status: true, isKycVerified: true });
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      // ✅ Specific selected users
      users = await userModel.find({
        _id: { $in: userIds },
        status: true,
        isKycVerified: true,
      });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "No user selected" });
    }

    if (!users.length) {
      return res
        .status(404)
        .json({ success: false, message: "No users found" });
    }

    for (const user of users) {
      user.plan = {
        planId: plan._id,
        planType,
        startDate,
        endDate,
      };

      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: `Plan '${plan.name}' assigned to ${applyToAll ? "all users" : users.length + " user(s)"
        }`,
    });
  } catch (error) {
    console.error("Buy Pass Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// remove buypass

const removeBuyPassPlan = async (req, res) => {
  try {
    const { userIds, removeAll = false } = req.body;

    let users;
    if (removeAll) {
      users = await userModel.find({ "plan.planId": { $exists: true } });
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      users = await userModel.find({ _id: { $in: userIds } });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "No user selected" });
    }

    if (!users.length) {
      return res
        .status(404)
        .json({ success: false, message: "No users found" });
    }

    for (const user of users) {
      user.plan = {};
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: removeAll
        ? "BuyPass removed from all users"
        : `BuyPass removed from ${users.length} user(s)`,
    });
  } catch (error) {
    console.error("Remove BuyPass Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Role wise plan history
const getAllUsersPlanHistory = async (req, res) => {
  try {
    const currentUser = req.user;

    let query = {};

    // 🔐 Role based access
    if (currentUser.role === "Admin" || currentUser.role === "superAdmin") {
      query = {};
    } else if (currentUser.role === "Distributor") {
      query = { _id: currentUser.id };
    } else if (["Retailer", "User"].includes(currentUser.role)) {
      query = { _id: currentUser.id };
    } else {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      search,
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;
    console.log(req.query);
    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { mobileNumber: regex },
        { UserId: regex },
      ];
    }

    if (status === "current") {
      query["plan.planId"] = { $ne: null };
    } else if (status === "expired") {
      query["planHistory.status"] = "expired";
    } else if (status === "noplan") {
      query["plan.planId"] = null;
    }

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      query["plan.startDate"] = { $gte: from, $lte: to };
    }

    const skip = (page - 1) * limit;

    // Fetch data + count
    const [users, total] = await Promise.all([
      userModel
        .find(query)
        .select("name role email UserId mobileNumber status plan planHistory")
        .populate("planHistory")
        .populate("plan")
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      userModel.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      data: users,
    });
  } catch (error) {
    console.error("Error in getAllUsersPlanHistory:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  buyPlan,
  getUserBuyServices,
  buyPassPlan,
  removeBuyPassPlan,
  getAllUsersPlanHistory,
};
