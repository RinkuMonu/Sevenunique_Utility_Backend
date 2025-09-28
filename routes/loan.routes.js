const express = require("express");
const router = express.Router();
const C = require("../controllers/loan.controller");
const authenticateToken = require("../middleware/verifyToken");
const upload = require("../utils/uplods");

// Public or Admin
router.get("/categories", authenticateToken, C.getCategories);
router.post("/categories", authenticateToken, C.createCategory);

// Retailer
router.post(
  "/",
  upload.array("documents", 10),
  authenticateToken,
  C.createLead
);
router.get("/my", authenticateToken, C.getMyLeads);

// Admin
router.get("/", authenticateToken, C.listLeads);
router.get("/:id", authenticateToken, C.getLeadById);
router.patch("/:id", authenticateToken, C.updateLead);

module.exports = router;
