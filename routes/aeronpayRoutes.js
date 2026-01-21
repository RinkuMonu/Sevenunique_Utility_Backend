const express = require("express");
const { bankFetch, transfer, callBack } = require("../controllers/aeronpayController");
const authenticateToken = require("../middleware/verifyToken");
const aeronpayRouter = express.Router();

aeronpayRouter.post("/bankFetch", authenticateToken, bankFetch)
aeronpayRouter.post("/transfer", authenticateToken, transfer)
aeronpayRouter.post("/callBack", callBack)

module.exports = aeronpayRouter;