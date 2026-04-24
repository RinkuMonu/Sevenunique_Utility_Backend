const express = require("express");
const { getBbpsServices, getBbpsBillerDetails, getBbpsBillerParams } = require("../../../controllers/ecuzen/bbps/ecuzenBbpsController");
const ecuzenBbpsRouter = express.Router();

ecuzenBbpsRouter.get("/get-services", getBbpsServices);
ecuzenBbpsRouter.post("/biller-details", getBbpsBillerDetails);
ecuzenBbpsRouter.post("/biller-params", getBbpsBillerParams);

module.exports = ecuzenBbpsRouter;
