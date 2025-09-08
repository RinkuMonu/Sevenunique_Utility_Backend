const express = require('express');
const router = express.Router();
const {validate,getRechargeStatus,initiateRecharge,getRechargebalance,getviewbill} = require('../controllers/rechargeController');

router.post('/validate', validate);
router.post('/recharge',initiateRecharge);
router.post("/rechargeStatus", getRechargeStatus);
router.get("/retailerbalance", getRechargebalance);
router.post("/viewbill", getviewbill);

module.exports = router;
