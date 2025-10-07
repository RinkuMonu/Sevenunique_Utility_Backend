const express = require("express");
const router = express.Router();
const bannerController = require("../controllers/bannerController");
const upload = require("../utils/uplods");


// Upload with image file
router.post("/", upload.single("bannerUrl"), bannerController.createBanner);
router.get("/", bannerController.getAllBanners);
router.get("/:id", bannerController.getBannerById);
router.put("/:id", upload.single("bannerUrl"), bannerController.updateBanner);
router.delete("/:id", bannerController.deleteBanner);
router.put("/status/:id", bannerController.toggleBannerStatus);
module.exports = router;
