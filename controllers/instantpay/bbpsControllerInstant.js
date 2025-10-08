// controllers/bbpsController.js
require("dotenv").config();
const axios = require("axios");
const createError = require("http-errors");
const Joi = require("joi");

const instantpay = axios.create({
  baseURL: "https://api.instantpay.in",
  timeout: 20000,
});


function normalizePayloadForEnquiry(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164", // fallback IPv4
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}) // allow override
    },
 remarks: {
      param1: String(body.mobile || "9876543210") // ✅ mobile se lo, 10 digit string banao
    }
  };
}

function normalizePayloadForPayment(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      terminalId: "12813923",
      mobile : "9876543211",
              postalCode: "110044",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {})
    },
    paymentMode: "Cash", // always default Cash
    paymentInfo: { Remarks: "CashPayment" }, // default remarks
    remarks: {
      // ✅ yaha hamesha mobile number dalna hai, consumer number nahi
      param1: String(body.mobile || body.inputParameters?.mobile || "9876543210")
    }
  };
}



// Common headers builder
function buildHeaders({ withOutlet = false } = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Ipay-Auth-Code": process.env.IPAY_AUTH_CODE || "1",
    "X-Ipay-Client-Id": process.env.IPAY_CLIENT_ID,
    "X-Ipay-Client-Secret": process.env.IPAY_CLIENT_SECRET,
    "X-Ipay-Endpoint-Ip": process.env.IPAY_ENDPOINT_IP,
  };
  if (withOutlet) headers["X-Ipay-Outlet-Id"] = process.env.IPAY_OUTLET_ID;
  return headers;
}

// helper for success/error
const forward = (res, data) => res.status(200).json(data);
const onErr = (next, err) => {
  if (err.response) {
    return next(
      createError(err.response.status || 502, {
        message: err.response.data?.message || "Upstream error",
        upstream: err.response.data,
      })
    );
  }
  return next(createError(500, err.message || "Internal error"));
};

// All APIs defined here:

// 1) Circle Lookup
exports.circleLookup = async (req, res, next) => {
  try {
    const schema = Joi.object({
      type: Joi.string().required(),
      type_: Joi.string().required(),
      msisdn: Joi.string().required(),
      billerId: Joi.string().required(),
    });
    const body = await schema.validateAsync(req.body);
    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/circle",
      body,
      { headers: buildHeaders() }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 2) Plans
exports.getPlans = async (req, res, next) => {
  try {
    const schema = Joi.object({
      billerId: Joi.string().required(),
      circleCode: Joi.string().required(),
    });
    const q = await schema.validateAsync(req.query);
    const { data } = await instantpay.get(
      "/marketplace/utilityPayments/plans",
      { headers: buildHeaders({ withOutlet: true }), params: q }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 3) Categories
exports.getCategories = async (_req, res, next) => {
  try {
    const { data } = await instantpay.get(
      "/marketplace/utilityPayments/category",
      { headers: buildHeaders({ withOutlet: true }) }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 4) Biller List
exports.listBillers = async (req, res, next) => {
  try {
    const schema = Joi.object({
      pagination: Joi.object({
        pageNumber: Joi.number().default(1),
        recordsPerPage: Joi.number().default(199),
      }).default(),
      filters: Joi.object({
        categoryKey: Joi.string().required(),
        updatedAfterDate: Joi.string().allow("", null).default(""),
      }).required(),
    });
    const body = await schema.validateAsync(req.body);
    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/billers",
      body,
      { headers: buildHeaders({ withOutlet: true }) }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 5) Biller Details
exports.getBillerDetails = async (req, res, next) => {
  try {
    const schema = Joi.object({ billerId: Joi.string().required() });
    const body = await schema.validateAsync(req.body);
    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/billerDetails",
      body,
      { headers: buildHeaders({ withOutlet: true }) }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 6) PrePayment Enquiry
exports.prePaymentEnquiry = async (req, res, next) => {
  try {
    const schema = Joi.object({
      billerId: Joi.string().required(),
      externalRef: Joi.string().required(),
      inputParameters: Joi.object().unknown(true).required(),
      transactionAmount: Joi.number().required(),
    });
    const body = await schema.validateAsync(req.body);

    const payload = normalizePayloadForEnquiry(body);

    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/prePaymentEnquiry",
      payload,
      { headers: buildHeaders({ withOutlet: true }) }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

// 7) Payment
exports.makePayment = async (req, res, next) => {
  try {
    const schema = Joi.object({
      billerId: Joi.string().required(),
      externalRef: Joi.string().required(),
      enquiryReferenceId: Joi.string().required(),
      inputParameters: Joi.object().unknown(true).required(),
      transactionAmount: Joi.number().required(),
        paymentMode: Joi.string().default("Cash"),  // ✅ default Cash
  paymentInfo: Joi.object().unknown(true).default({ Remarks: "CashPayment" }),
    });
    const body = await schema.validateAsync(req.body);

    const payload = normalizePayloadForPayment(body);

    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/payment",
      payload,
      { headers: buildHeaders({ withOutlet: true }) }
    );
    forward(res, data);
  } catch (err) { onErr(next, err); }
};

