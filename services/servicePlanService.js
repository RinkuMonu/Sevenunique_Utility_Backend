const ServicePlan = require("../models/servicePlanmodel");

const createPlan = async (planData) => {
  try {
    const newPlan = new ServicePlan(planData);
    await newPlan.save();
    return newPlan;
  } catch (error) {
    throw new Error("Error creating plan: " + error.message);
  }
};

const getAllPlans = async () => {
  try {
    const plans = await ServicePlan.find();
    return plans;
  } catch (error) {
    throw new Error("Error fetching plans: " + error.message);
  }
};

const getPlanById = async (id) => {
  try {
    const plan = await ServicePlan.findById(id);
    if (!plan) throw new Error("Plan not found");
    return plan;
  } catch (error) {
    throw new Error("Error fetching plan: " + error.message);
  }
};

const updatePlan = async (id, planData) => {
  try {
    const updatedPlan = await ServicePlan.findByIdAndUpdate(id, planData, {
      new: true,
    });
    if (!updatedPlan) throw new Error("Plan not found");
    return updatedPlan;
  } catch (error) {
    throw new Error("Error updating plan: " + error.message);
  }
};

const deletePlan = async (id) => {
  try {
    const deletedPlan = await ServicePlan.findByIdAndDelete(id);
    if (!deletedPlan) throw new Error("Plan not found");
    return deletedPlan;
  } catch (error) {
    throw new Error("Error deleting plan: " + error.message);
  }
};

module.exports = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
};
