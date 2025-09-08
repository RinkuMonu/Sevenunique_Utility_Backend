const express = require('express');
const { validate, viewbill, initiateRecharge, operatorLogo, getPlans, getPlanTypes } = require('../../controllers/billAvenueController');
const router = express.Router();

router.post('/validate', validate);
router.post('/viewbill', viewbill);
router.post('/recharge', initiateRecharge);

router.get("/logo", operatorLogo);

router.post('/plansAPI', getPlans);
router.post('/plansTypeAPI', getPlanTypes);

module.exports = router;