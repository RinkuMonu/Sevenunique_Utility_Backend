const { operatorLogoService } = require("../services/OpLogoService");
const { rechargeValidation, rechargeviewbill, recharge } = require("../services/creditbillService");
const { fetchPlans } = require('../services/planService');
const { fetchPlanType } = require('../services/planService');


// credit bill payment start 

const validate = async (req, res) => {
  const { uid, password, amt, cir, cn, op, adParams } = req.body;

  try {
    // Validate request body if necessary
    if (!uid || !password || !amt || !cir || !cn || !op) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Call service to handle recharge logic
    const response = await rechargeValidation({ uid, password, amt, cir, cn, op, adParams });

    // Return the response
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error in recharge:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const viewbill = async (req, res) => {
  const { uid, password, encrypted_card, mobile, last4 } = req.body;

  try {
    // Validate request body if necessary
    if (!uid || !password || !encrypted_card || !mobile || !last4) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Call service to handle recharge logic
    const response = await rechargeviewbill({ uid, password, mobile, last4, encrypted_card });
    //console.log("first", response);
    // Return the response
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error in recharge:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const initiateRecharge = async (req, res) => {
  const { uid, pwd, cn, op, cir, amt, reqid, ad9 } = req.body;

  if (!uid || !pwd || !cn || !op || !cir || !amt || !reqid) {
    return res.status(400).json({ error: 'Missing required query parameters' });
  }

  try {
    const response = await recharge(uid, pwd, cn, op, cir, amt, reqid, ad9);
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error during recharge:', error);
    return res.status(500).json({ error: 'Failed to process the recharge request' });
  }
};
// credit bill payment end 

const operatorLogo = async (req, res) => {
  try {
    const { op_id } = req.body;

    const response = await operatorLogoService({ op_id });
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error"
    });
  }
};

const getPlanTypes = async (req, res) => {
  const { op_id, cir_id, plan_type } = req.body;

  if (!op_id || !cir_id) {
    return res.status(400).send('This field is mandatory')
  }
  try {
    // Fetch recharge plans using the service
    const plans = await fetchPlanType(op_id, cir_id, plan_type);
    //console.log(plans);
    if (!plans) {
      res.status(400).send('No plan found')
    }
    return res.status(200).json({
      success: true,
      data: {
        plans: plans,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: {
        code: '103',
        text: 'Recharge plans not available for the specified operator, circle.',
      },
    });
  }
};

const getPlans = async (req, res) => {
  const { op_id, cir_id } = req.body;
  if (!op_id || !cir_id) {
    return res.status(400).send('This field is mandatory')
  }
  try {
    // Fetch recharge plans using the service
    const plans = await fetchPlans(op_id, cir_id);
    if (!plans) {
      res.status(400).send('No plan found')
    }
    return res.status(200).json({
      success: true,
      data: {
        plans: plans,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: {
        code: '103',
        text: 'Recharge plans not available for the specified operator, circle.',
      },
    });
  }
};


module.exports = { validate, viewbill, initiateRecharge, operatorLogo, getPlanTypes, getPlans };