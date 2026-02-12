const express = require("express");
const { bankFetch, transfer, callBack, checkTransactionStatus, transfer1 } = require("../controllers/aeronpayController");
const authenticateToken = require("../middleware/verifyToken");
const aeronpayRouter = express.Router();

aeronpayRouter.post("/bankFetch", authenticateToken, bankFetch)
aeronpayRouter.post("/transfer", authenticateToken, transfer)

aeronpayRouter.post("/transfer1", authenticateToken, transfer1)
aeronpayRouter.post("/callBack", callBack)
aeronpayRouter.post("/Status", checkTransactionStatus)

module.exports = aeronpayRouter;