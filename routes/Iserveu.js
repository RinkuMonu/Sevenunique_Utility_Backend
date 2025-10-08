const express = require("express");
const { getToken, aepsCallback, matmCallback } = require("../controllers/Iserveu");
const router = express.Router();

// 🔹 AEPS Routes
router.get("/get-token", getToken);
router.post("/callback", aepsCallback);
router.post("/matm/callback", matmCallback);

module.exports = router;
