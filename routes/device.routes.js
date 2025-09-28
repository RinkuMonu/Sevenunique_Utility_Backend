const router = require("express").Router();
const C = require("../controllers/device.controller");
const authenticateToken = require("../middleware/verifyToken");
const DeviceModal = require("../models/Device.modal");
const upload = require("../utils/uplods");

/* Devices (admin manage, retailer list) */
router.get("/devices", C.listDevices);

router.get("/brands", async (req, res) => {
  const brands = await DeviceModal.distinct("brand");
  res.json({ success: true, data: brands });
});

router.post("/devices", upload.single("image"), C.createDevice);

/* Requests */
router.post("/device-requests", authenticateToken, C.createDeviceRequest);
router.get("/device-requests", authenticateToken, C.listDeviceRequests);
router.patch("/device-requests/:id", authenticateToken, C.updateDeviceRequest);
router.patch("/devices/:id", upload.single("image"), C.updateDevice);
router.delete("/devices/:id", authenticateToken, C.deleteDevice);

module.exports = router;
