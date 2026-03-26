const express = require("express");
const {
  createNews,
  getAllNews,
  getNewsById,
  updateNews,
  deleteNews,
  getDashboardTitle,
  sendBulkEmail,
  getUsersForBulkEmail,
} = require("../controllers/news.controller");
const authenticateToken = require("../middleware/verifyToken");
const NewsRouter = express.Router();

// CRUD routes
NewsRouter.post("/", createNews);
NewsRouter.get("/", getAllNews);
NewsRouter.get("/:id", getNewsById);
NewsRouter.put("/:id", updateNews);
NewsRouter.delete("/:id", deleteNews);


NewsRouter.get("/bulk-email-users", authenticateToken, getUsersForBulkEmail);
NewsRouter.post("/send-bulk-email", authenticateToken, sendBulkEmail);

// Dashboard title
NewsRouter.get("/dashboard/title", getDashboardTitle);

module.exports = NewsRouter;
