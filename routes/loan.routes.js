const express = require("express");
const router = express.Router();
const C = require("../controllers/loan.controller");
const authenticateToken = require("../middleware/verifyToken");
const upload = require("../utils/uplods");
const authorizeRoles = require("../middleware/verifyRole");

// Public or Admin
router.get("/categories", authenticateToken, C.getCategories);
router.post("/categories", authenticateToken, authorizeRoles("Admin"), C.createCategory);

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
router.get("/export", authenticateToken, C.exportLoans);
router.get("/:id", authenticateToken, C.getLeadById);
router.patch("/:id", authenticateToken, authorizeRoles("Admin"), C.updateLead);

module.exports = router;
