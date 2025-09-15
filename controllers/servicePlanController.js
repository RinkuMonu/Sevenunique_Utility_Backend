const planService = require("../services/servicePlanService");
const ServicePlan = require("../models/servicePlanmodel");
const userModel = require("../models/userModel");
const servicesModal = require("../models/servicesModal");

// const createPlan = async (req, res) => {
//   try {
//     const { name, services, amount } = req.body;

//     // ✅ Validate plan name
//     if (!name || !["basic", "advance", "standard"].includes(name)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid plan name" });
//     }

//     // ✅ Validate services
//     if (!Array.isArray(services) || services.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Services must be an array and cannot be empty",
//       });
//     }

//     // ✅ Validate amount array
//     if (!Array.isArray(amount) || amount.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Amount must be an array and cannot be empty",
//       });
//     }

//     // ✅ Validate each amount type and value
//     for (const item of amount) {
//       if (
//         !item.type ||
//         !["monthly", "quarterly", "half-yearly", "yearly"].includes(item.type)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid type in amount: ${item.type}`,
//         });
//       }
//       if (!item.value || typeof item.value !== "string") {
//         return res.status(400).json({
//           success: false,
//           message: `Amount value must be a string for type: ${item.type}`,
//         });
//       }
//     }

//     // ✅ Check if the plan already exists
//     const existingPlan = await ServicePlan.findOne({ name });

//     const planData = {
//       name,
//       services,
//       amount,
//     };

//     if (existingPlan) {
//       // 🔥 Update existing plan if found
//       const updatedPlan = await ServicePlan.findByIdAndUpdate(
//         existingPlan._id,
//         planData,
//         { new: true }
//       );
//       return res
//         .status(200)
//         .json({
//           success: true,
//           message: "Plan updated successfully",
//           data: updatedPlan,
//         });
//     } else {
//       // 🆕 Create a new plan if not found
//       const newPlan = new ServicePlan(planData);
//       await newPlan.save();
//       return res
//         .status(201)
//         .json({
//           success: true,
//           message: "Plan created successfully",
//           data: newPlan,
//         });
//     }
//   } catch (error) {
//     console.error("Error in createPlan:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

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

// const updatePlan = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, services, amount } = req.body;

//     if (name && !["basic", "advance", "standard"].includes(name)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid plan name" });
//     }

//     if (services && (!Array.isArray(services) || services.length === 0)) {
//       return res.status(400).json({
//         success: false,
//         message: "Services must be an array and cannot be empty",
//       });
//     }

//     if (amount && (!Array.isArray(amount) || amount.length === 0)) {
//       return res.status(400).json({
//         success: false,
//         message: "Amount must be an array and cannot be empty",
//       });
//     }

//     if (amount) {
//       amount.forEach((item) => {
//         // ✅ Convert to number first
//         item.value = Number(item.value);

//         if (
//           !item.type ||
//           !["monthly", "quarterly", "half-yearly", "yearly"].includes(item.type)
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Invalid type in amount: ${item.type}`,
//           });
//         }

//         if (isNaN(item.value)) {
//           return res.status(400).json({
//             success: false,
//             message: `Amount value must be a number for type: ${item.type}`,
//           });
//         }
//       });
//     }
//     if (discountPercent !== undefined) {
//       updatedPlanData.discountPercent = discountPercent;
//       updatedPlanData.amount = updatedPlanData.amount.map((item) => {
//         const discountedValue =
//           Number(item.value) - (Number(item.value) * discountPercent) / 100;
//         return { ...item, discountedValue: Number(discountedValue.toFixed(2)) };
//       });
//     }

//     const updatedPlanData = {
//       name,
//       services,
//       amount,
//     };

//     const updatedPlan = await planService.updatePlan(id, updatedPlanData);
//     res.status(200).json({ success: true, data: updatedPlan });
//   } catch (error) {
//     res.status(400).json({ success: false, message: error.message });
//   }
// };

const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPlan = await planService.deletePlan(id);
    res.status(200).json({ success: true, data: deletedPlan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// controller: buyPlan
const buyPlan = async (req, res) => {
  try {
    const { planId, planType } = req.body;
    const userId = req.user.id;

    const plan = await ServicePlan.findById(planId);
    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    const selectedAmount = plan.amount.find((a) => a.type === planType);
    console.log(plan, selectedAmount);
    
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

    const userfind = await userModel.findById(userId);
    if (!userfind) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ Save old plan to history before overwriting
    if (userfind.plan?.planId) {
      userfind.planHistory.push({
        planId: userfind.plan.planId,
        planType: userfind.plan.planType,
        startDate: userfind.plan.startDate,
        endDate: userfind.plan.endDate,
        status: new Date() > userfind.plan.endDate ? "expired" : "cancelled",
      });
    }

    // ✅ Now set the new plan
    userfind.plan = {
      planId: plan._id,
      planType,
      startDate,
      endDate,
    };

    await userfind.save();

    // ✅ Populate response
    const updatedUser = await userModel
      .findById(userId)
      .populate("plan.planId", "name services amount")
      .select("-password");

    const planData = updatedUser.plan.planId;
    const planAmount = planData.amount.find((a) => a.type === planType);
    const remainingDays = Math.floor(
      (new Date(endDate).setHours(0, 0, 0, 0) -
        new Date().setHours(0, 0, 0, 0)) /
        (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      success: true,
      message: "Plan activated",
      PLAN: {
        planId: planData._id,
        planName: planData.name,
        planType,
        price: planAmount?.value || 0,
        discountPercent: planAmount?.discountPercent || 0,
        finalPrice: planAmount?.discountedValue || planAmount?.value || 0,
        startDate,
        endDate,
        remainingDays,
      },
    });
  } catch (error) {
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
      users = await userModel.find({ status: true });
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      // ✅ Specific selected users
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
      // Ensure planHistory exists
      if (!Array.isArray(user.planHistory)) user.planHistory = [];

      // Old plan ko history me push karo only if old plan exists
      if (user.plan?.planId) {
        user.planHistory.push({
          planId: user.plan.planId,
          planType: user.plan.planType,
          startDate: user.plan.startDate,
          endDate: user.plan.endDate,
          status:
            user.plan.endDate && new Date() > user.plan.endDate
              ? "expired"
              : "cancelled",
        });
      }

      // Assign new plan
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
      message: `Plan '${plan.name}' assigned to ${
        applyToAll ? "all users" : users.length + " user(s)"
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
      if (user.plan?.planId) {
        user.planHistory.push({
          planId: user.plan.planId,
          planType: user.plan.planType,
          startDate: user.plan.startDate,
          endDate: user.plan.endDate,
          status: "expired",
        });
      }
      user.plan = {}; // BuyPass remove
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

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  buyPlan,
  getUserBuyServices,
  buyPassPlan,
  removeBuyPassPlan
};
