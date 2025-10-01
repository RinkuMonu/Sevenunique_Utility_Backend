const express = require("express");
const router = express.Router();
const controller = require("../controllers/paymentRequestController");
const authenticateToken = require("../middleware/verifyToken");
const upload = require("../utils/uplods");

router.post(
  "/",
  authenticateToken,
  upload.single("transactionSS"),
  controller.createPaymentRequest
);
router.get("/:id", authenticateToken, controller.getPaymentRequestById);
router.get("/", authenticateToken, controller.listPaymentRequests);
router.put(
  "/:id/status",
  authenticateToken,
  controller.updatePaymentRequestStatus
);
router.post(
  "/fund/transfor",
  authenticateToken,
  controller.fundTransfer
);

module.exports = router;
