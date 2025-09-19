const {
  rechargeValidation,
  checkRechargeStatus,
  checkRetailerBalance,
  viewbill,
  recharge,
} = require("../services/rechargeService"); 

const validate = async (req, res) => {
  const { uid, password, amt, cir, cn, op, adParams } = req.body;

  try {
   
    if (!uid || !password || !amt || !cir || !cn || !op) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const response = await rechargeValidation({
      uid,
      password,
      amt,
      cir,
      cn,
      op, 
      adParams,
    });

    // Return the response
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error in recharge:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const initiateRecharge = async (req, res) => {
  const { uid, pwd, cn, op, cir, amt, reqid } = req.body;

  if (!uid || !pwd || !cn || !op || !cir || !amt || !reqid) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  try {
    const response = await recharge(uid, pwd, cn, op, cir, amt, reqid);
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error during recharge:", error);
    return res
      .status(500)
      .json({ error: "Failed to process the recharge request" });
  }
};

const getRechargeStatus = async (req, res) => {
  try {
    const { txId } = req.body;

    if (!txId) {
      return res
        .status(400)
        .json({ success: false, message: "Transaction ID is required" });
    }

    const response = await checkRechargeStatus(txId);
    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
  }
};

const getRechargebalance = async (req, res) => {
  try {
    const response = await checkRetailerBalance();
    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
  }
};

const getviewbill = async (req, res) => {
  try {
    const { cir, cn, op } = req.body;
    const response = await viewbill({ cir, cn, op });
    console.log("sdfghjk", response);
    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: error.message,
      });
  }
};

module.exports = {
  validate,
  initiateRecharge,
  getRechargeStatus,
  getviewbill,
  getRechargebalance,
};
