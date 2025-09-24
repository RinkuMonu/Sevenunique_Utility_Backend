const express = require("express");
const { getToken, aepsCallback } = require("../controllers/Iserveu");
const router = express.Router();

// 🔹 AEPS Routes
router.get("/get-token", getToken);
router.post("/callback", aepsCallback);

module.exports = router;
