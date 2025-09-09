const express = require("express");
const {
  createNews,
  getAllNews,
  getNewsById,
  updateNews,
  deleteNews,
  getDashboardTitle,
} = require("../controllers/news.controller");
const NewsRouter = express.Router();

// CRUD routes
NewsRouter.post("/", createNews);
NewsRouter.get("/", getAllNews);
NewsRouter.get("/:id", getNewsById);
NewsRouter.put("/:id", updateNews);
NewsRouter.delete("/:id", deleteNews);

// Dashboard title
NewsRouter.get("/dashboard/title", getDashboardTitle);

module.exports = NewsRouter;
