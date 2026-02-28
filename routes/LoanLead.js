const { Lead_status_check, Generate_URL } = require("../controllers/SprintVerify/LoanLeadController");
const authenticateToken = require("../middleware/verifyToken");

const loanLeadRouter = require("express").Router();


loanLeadRouter.post("/Generate-URL", authenticateToken, Generate_URL)
loanLeadRouter.post("/Lead-status-check", authenticateToken, Lead_status_check)
module.exports = loanLeadRouter;