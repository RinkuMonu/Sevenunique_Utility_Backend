// routes/bannerTickerRoutes.js

const { createTicker, getActiveTickers, updateTicker, deleteTicker, getTickers } = require("../controllers/bannerTickerController.js");

const express = require("express");

const upload = require("../utils/uplods");
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");
const BannerTickerRouter = express.Router();

// create
BannerTickerRouter.post("/",upload.single("logo"),authenticateToken, authorizeRoles("Admin"),  createTicker);

// get (frontend use)
BannerTickerRouter.get("/",authenticateToken, authorizeRoles("Admin"), getTickers);
BannerTickerRouter.get("/active", getActiveTickers);

// update
BannerTickerRouter.put("/:id",upload.single("logo"), authenticateToken,  authorizeRoles("Admin"),updateTicker);

// delete
BannerTickerRouter.delete("/:id", authenticateToken, authorizeRoles("Admin"), deleteTicker);

module.exports = BannerTickerRouter;
