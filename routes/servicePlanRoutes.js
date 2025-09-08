const express = require('express');
const router = express.Router();
const {createPlan, getAllPlans, getPlanById, updatePlan, deletePlan} = require('../controllers/servicePlanController');

// Routes for Plan operations
router.post('/', createPlan); 
router.get('/', getAllPlans); 
router.get('/:id', getPlanById); 
router.put('/:id', updatePlan); 
router.delete('/:id', deletePlan); 

module.exports = router;
