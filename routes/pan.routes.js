const express = require("express");
const panroute = express.Router();
const { createPanRequest } = require("../controllers/pan.controller");

panroute.post("/generate-pan-request", createPanRequest);

module.exports = panroute;
