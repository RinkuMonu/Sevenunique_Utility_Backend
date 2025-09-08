const planService = require("../services/servicePlanService");
const ServicePlan = require("../models/servicePlanmodel");

const createPlan = async (req, res) => {
  try {
    const { name, services, amount } = req.body;

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

    // ✅ Validate each amount type and value
    for (const item of amount) {
      if (
        !item.type ||
        !["monthly", "quarterly", "half-yearly", "yearly"].includes(item.type)
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid type in amount: ${item.type}`,
        });
      }
      if (!item.value || typeof item.value !== "string") {
        return res.status(400).json({
          success: false,
          message: `Amount value must be a string for type: ${item.type}`,
        });
      }
    }

    // ✅ Check if the plan already exists
    const existingPlan = await ServicePlan.findOne({ name });

    const planData = {
      name,
      services,
      amount,
    };

    if (existingPlan) {
      // 🔥 Update existing plan if found
      const updatedPlan = await ServicePlan.findByIdAndUpdate(
        existingPlan._id,
        planData,
        { new: true }
      );
      return res
        .status(200)
        .json({ success: true, message: "Plan updated successfully", data: updatedPlan });
    } else {
      // 🆕 Create a new plan if not found
      const newPlan = new ServicePlan(planData);
      await newPlan.save();
      return res
        .status(201)
        .json({ success: true, message: "Plan created successfully", data: newPlan });
    }
  } catch (error) {
    console.error("Error in createPlan:", error);
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

    if (name && !["basic", "advance", "standard"].includes(name)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid plan name" });
    }

    if (services && (!Array.isArray(services) || services.length === 0)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Services must be an array and cannot be empty",
        });
    }

    if (amount && (!Array.isArray(amount) || amount.length === 0)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Amount must be an array and cannot be empty",
        });
    }

    if (amount) {
      amount.forEach((item) => {
        if (
          !item.type ||
          !["monthly", "quarterly", "half-yearly", "yearly"].includes(item.type)
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message: `Invalid type in amount: ${item.type}`,
            });
        }
        if (!item.value || typeof item.value !== "number") {
          return res
            .status(400)
            .json({
              success: false,
              message: `Amount value must be a number for type: ${item.type}`,
            });
        }
      });
    }

    const updatedPlanData = {
      name,
      services,
      amount,
    };

    const updatedPlan = await planService.updatePlan(id, updatedPlanData);
    res.status(200).json({ success: true, data: updatedPlan });
  } catch (error) {
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

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
};
