const { fetchBill, payBill, StatusEnquiry } = require("../controllers/SprintVerify/LIC_Controller");
const authenticateToken = require("../middleware/verifyToken");

const licRouter = require("express").Router();


licRouter.post("/fetchBill/details", authenticateToken, fetchBill)
licRouter.post("/payBill", authenticateToken, payBill)
licRouter.post("/StatusEnquiry", authenticateToken, StatusEnquiry)
module.exports = licRouter;