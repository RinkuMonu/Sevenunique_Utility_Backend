const express = require("express");
const router = express.Router();
const controller = require("../controllers/paymentRequestController");
const authenticateToken = require("../middleware/verifyToken");


router.post("/", authenticateToken, controller.createPaymentRequest);
router.get("/:id", authenticateToken, controller.getPaymentRequestById);
router.get("/", authenticateToken, controller.listPaymentRequests);
router.put("/:id/status", authenticateToken, controller.updatePaymentRequestStatus);

module.exports = router;
