const express = require("express");
const { getBbpsServices } = require("../../../controllers/ecuzen/bbps/ecuzenBbpsController");
const ecuzenBbpsRouter = express.Router();

ecuzenBbpsRouter.get("/getBbps-services",getBbpsServices);

module.exports = ecuzenBbpsRouter;
