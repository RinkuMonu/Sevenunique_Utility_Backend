require("dotenv").config();
const axios = require("axios");
const createError = require("http-errors");
const Joi = require("joi");

// Axios client for InstantPay
const instantpay = axios.create({
  baseURL: "https://api.instantpay.in",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    "X-Ipay-Client-Id": process.env.INSTANTPAY_CLIENT_ID,
    "X-Ipay-Client-Secret": process.env.INSTANTPAY_CLIENT_SECRET,
    "X-Ipay-Auth-Code": process.env.INSTANTPAY_AUTH_CODE,
  },
});

// Helpers
function normalizePayloadForEnquiry(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}

function normalizePayloadForPayment(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    paymentMode: body.paymentMode || "Cash",
    paymentInfo: body.paymentInfo || { Remarks: "CashPayment" },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}
exports.outletRegister = async (req, res, next) => {
  try {
    const schema = Joi.object({
      mobile: Joi.string().length(10).required(),
      email: Joi.string().email().required(),
      aadhaar: Joi.string().length(12).required(),
      pan: Joi.string().length(10).required(),
      shopName: Joi.string().required(),
      address: Joi.string().required(),
      pincode: Joi.string().length(6).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) throw createError(400, error.details[0].message);

    const response = await instantpay.post("/fi/outlet/register", value);
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Register Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLoginStatus = async (req, res, next) => {
  try {
    const { outletId } = req.body;
    if (!outletId) throw createError(400, "OutletId required");

    const response = await instantpay.post("/fi/outlet/login/status", { outletId });
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Login Status Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLogin = async (req, res, next) => {
  try {
    const { outletId, aadhaar, pidData } = req.body;
    if (!outletId || !aadhaar || !pidData) throw createError(400, "Missing parameters");

    const payload = {
      outletId,
      aadhaar,
      pidData, // PID XML from RD Service
      deviceInfo: {
        ip: "103.254.205.164",
        geoCode: "28.6139,77.2090",
      },
    };

    const response = await instantpay.post("/fi/outlet/login", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Login Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.cashWithdrawal = async (req, res, next) => {
  try {
    const { aadhaar, iin, mobile, amount, pidData } = req.body;
    if (!aadhaar || !iin || !mobile || !amount || !pidData) {
      throw createError(400, "Missing required fields");
    }

    const payload = normalizePayloadForPayment({
      aadhaar,
      iin,
      mobile,
      amount,
      pidData,
      externalRef: "REF" + Date.now(),
    });

    const response = await instantpay.post("/fi/aeps/cashWithdrawal", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Cash Withdrawal Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.balanceEnquiry = async (req, res, next) => {
  try {
    const { aadhaar, iin, mobile, pidData } = req.body;
    if (!aadhaar || !iin || !mobile || !pidData) throw createError(400, "Missing required fields");

    const payload = normalizePayloadForEnquiry({
      aadhaar,
      iin,
      mobile,
      pidData,
      externalRef: "REF" + Date.now(),
    });

    const response = await instantpay.post("/fi/aeps/balanceInquiry", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Balance Enquiry Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.miniStatement = async (req, res, next) => {
  try {
    const { aadhaar, iin, mobile, pidData } = req.body;
    if (!aadhaar || !iin || !mobile || !pidData) throw createError(400, "Missing required fields");

    const payload = normalizePayloadForEnquiry({
      aadhaar,
      iin,
      mobile,
      pidData,
      externalRef: "REF" + Date.now(),
    });

    const response = await instantpay.post("/fi/aeps/miniStatement", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Mini Statement Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.getBankList = async (req, res, next) => {
  try {
    const response = await instantpay.get("/fi/aeps/banks");
    return res.json(response.data);
  } catch (err) {
    console.error("Bank List Error:", err.response?.data || err.message);
    next(err);
  }
};
