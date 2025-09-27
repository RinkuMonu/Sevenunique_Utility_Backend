const express = require("express");
const authenticateToken = require("../middleware/verifyToken");
const router = express.Router();
const {
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
} = require("../controllers/servicePlanController");

// Routes for Plan operations
router.get("/getAllPlansHistory", authenticateToken, getAllUsersPlanHistory);
router.get("/getUserbuyservices", authenticateToken, getUserBuyServices);
router.post("/buypassplan", authenticateToken, buyPassPlan);
router.post("/removebuypass", authenticateToken, removeBuyPassPlan);
router.post("/", createPlan);
router.get("/", getAllPlans);
router.get("/:id", getPlanById);
router.put("/:id", updatePlan);
router.delete("/:id", deletePlan);
router.post("/buyplan", authenticateToken, buyPlan);

module.exports = router;
