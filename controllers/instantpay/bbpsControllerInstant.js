// controllers/bbpsController.js
require("dotenv").config();
const axios = require("axios");
const createError = require("http-errors");
const Joi = require("joi");
const BbpsHistory = require("../../models/bbpsModel");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, calculateCommissionFromSlabs } = require("../../utils/chargeCaluate");
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const payOutModel = require("../../models/payOutModel");
const CommissionTransaction = require("../../models/CommissionTransaction");

const instantpay = axios.create({
  baseURL: "https://api.instantpay.in",
  timeout: 20000,
});


function normalizePayloadForEnquiry(body) {
  return {
    ...body,
    // initChannel: body.initChannel || "AGT",
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
    // initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      terminalId: "12813923",
      mobile: "9876543211",
      postalCode: "110044",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {})
    },
    // paymentMode: body.paymentMode || "Cash", 
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
    "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
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
    const { data } = await axios.post(
      "http://api.instantpay.in/marketplace/utilityPayments/telecomCircles",
      {},   // 👈 empty body
      { headers: buildHeaders({ withOutlet: true }) }  // 👈 outlet include
    );
    forward(res, data);
  } catch (err) {
    console.error("Circle Lookup Error:", err.response?.data || err.message);
    onErr(next, err);
  }
};

// 2) Plans

exports.getPlans = async (req, res, next) => {
  try {
    const schema = Joi.object({
      subProductCode: Joi.string().required(),
      telecomCircle: Joi.string().required(),
      externalRef: Joi.string().required(),
      latitude: Joi.string().required(),
      longitude: Joi.string().required(),
    });

    const body = await schema.validateAsync(req.body);

    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/rechargePlans", // ✅ correct endpoint
      body,                                        // ✅ body pass
      { headers: buildHeaders({ withOutlet: true }) }
    );

    forward(res, data);
  } catch (err) {
    console.error("Plans API Error:", err.response?.data || err.message);
    onErr(next, err);
  }
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
    // const schema = Joi.object({
    //   billerId: Joi.string().required(),
    //   externalRef: Joi.string().required(),
    //   inputParameters: Joi.object().unknown(true).required(),
    //   // transactionAmount: Joi.number().required(),
    // });
    // const body = await schema.validateAsync(req.body);

    const payload = normalizePayloadForEnquiry(req.body);

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Validate incoming request
    const schema = Joi.object({
      billerId: Joi.object().required(),
      externalRef: Joi.string().required(),
      enquiryReferenceId: Joi.string().required(),
      inputParameters: Joi.object().unknown(true).required(),
      transactionAmount: Joi.number().required(),
      paymentMode: Joi.string().default("Cash"),
      paymentInfo: Joi.object().unknown(true).default({ Remarks: "CashPayment" }),
      initChannel: Joi.string().required(),
      paymentMode: Joi.string().required(),
      user_id: Joi.string().required(),
      mpin: Joi.string().required(),
      category: Joi.string().required(),
    });

    const body = await schema.validateAsync(req.body);

    const { billerId, inputParameters, transactionAmount, user_id, mpin, enquiryReferenceId, externalRef, category, initChannel, paymentMode } = req.body;
    const userId = req.user?.id || user_id;

    const referenceid = `REF${Date.now()}`;
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    // ✅ MPIN check
    if (user.mpin != mpin) throw new Error("Invalid MPIN! Please enter a valid MPIN");

    // ✅ Fetch commission and service
    const { commissions, service } = await getApplicableServiceCharge(
      userId,
      category,
      billerId.billerName
    );

    let commission;
    if (commissions?.slabs?.length > 0) {
      commission = calculateCommissionFromSlabs(transactionAmount, commissions, billerId.billerName);
    }

    const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const required = Number((Number(transactionAmount) + Number(commission.charge || 0) + Number(commission.gst || 0) + Number(commission.tds || 0)).toFixed(2));


    // ✅ Balance check
    if (usableBalance < required) {
      await session.abortTransaction();
      return res.status(400).json({
        error: true,
        message: `Insufficient wallet balance. Maintain ₹${user.cappingMoney}. Available: ₹${user.eWallet}, Required: ₹${required}`,
      });
    }

    // ✅ Deduct wallet
    user.eWallet -= required;
    await user.save({ session });

    // ✅ Create debit transaction
    const [debitTxn] = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: Number(transactionAmount),
      type: service?._id || "BBPS",
      gst: Number(commission.gst || 0),
      tds: Number(commission.tds || 0),
      charge: Number(commission.charge || 0),
      totalDebit: Number(required),
      balance_after: user.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: referenceid,
      description: `Bill Payment for ${inputParameters.param1} (${billerId.billerName})`,
      status: "Pending",
    }], { session });


    // ✅ Create BBPS record
    const [rechargeRecord] = await BbpsHistory.create([{
      userId,
      rechargeType: service?._id,
      operator: billerId.billerName,
      customerNumber: inputParameters.param1,
      amount: Number(transactionAmount),
      retailerCommission: Number(
        (commission.retailer || 0) *
        (1 - (commission.gst || 0) / 100 - (commission.tds || 0) / 100)
      ).toFixed(2),
      distributorCommission: Number(
        (commission.distributor || 0) *
        (1 - (commission.gst || 0) / 100 - (commission.tds || 0) / 100)
      ).toFixed(2),
      adminCommission: Number(
        (commission.admin || 0) *
        (1 - (commission.gst || 0) / 100 - (commission.tds || 0) / 100)
      ).toFixed(2),
      gst: commission.gst,
      tds: commission.tds,
      charges: commission.charge,
      totalCommission: Number(commission.totalCommission || 0),
      totalDebit: Number(required),
      transactionId: referenceid,
      extraDetails: { mobileNumber: inputParameters.param1 },
      status: "Pending",
    }], { session });


    // ✅ Prepare payload and call InstantPay API
    const payload = normalizePayloadForPayment({ billerId: billerId.billerId, inputParameters, paymentMode, initChannel, transactionAmount, enquiryReferenceId, externalRef });
    console.log(payload);
    const { data } = await instantpay.post(
      "/marketplace/utilityPayments/payment",
      payload,
      { headers: buildHeaders({ withOutlet: true }) }
    );

    // ✅ Determine transaction status
    let statusUpdate = "Failed";
    if (data?.statuscode === "TXN" || data?.status === "Transaction Successful") {
      statusUpdate = "Success";
    } else if (data?.status === "Transaction Under Process") {
      statusUpdate = "Pending";
    }

    // ✅ On success → payout & commission credit
    if (statusUpdate === "Success") {
      await new payOutModel({
        userId,
        amount: Number(transactionAmount),
        reference: referenceid,
        type: service?._id || "BBPS",
        trans_mode: "WALLET",
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: commission.charge || 0,
        gst: commission.gst || 0,
        tds: commission.tds || 0,
        totalDebit: required,
        remark: `Bill Payment for ${inputParameters.param1}`,
      }).save({ session });


      await CommissionTransaction.create([{
        referenceId: referenceid,
        service: service?._id || "BBPS",
        baseAmount: Number(transactionAmount),
        charge: Number(commission.charge || 0),
        netAmount: Number(required),
        roles: [
          { userId, role: "Retailer", commission: commission.retailer || 0, chargeShare: commission.charge || 0 },
          { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
          { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
        ],
        type: "credit",
        status: "Success",
        sourceRetailerId: userId,
      }], { session });

      await distributeCommission({
        user: userId,
        distributer: user.distributorId,
        service,
        amount: transactionAmount,
        commission,
        reference: referenceid,
        description: `Commission for ${billerId.billerName}`,
        session,
      });
    } else if (statusUpdate === "Failed") {
      // ✅ Refund wallet if failed
      user.eWallet += required;
      await user.save({ session });
    }

    // ✅ Update BBPS & Transaction reports
    await Promise.all([
      BbpsHistory.findByIdAndUpdate(rechargeRecord._id, { status: statusUpdate, apiResponse: data }, { session }),
      Transaction.findByIdAndUpdate(
        debitTxn._id,
        {
          $set: {
            status: statusUpdate,
            apiResponse: data,
            balance_after: user.eWallet,
          },
        },
        { session }
      ),
    ]);

    await session.commitTransaction();
    forward(res, data);

  } catch (err) {

    console.error("❌ makePayment Error:", err || err.message);
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};


