const axios = require("axios");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate.js");
const BbpsHistory = require("../../models/bbpsModel.js");
const PayOut = require("../../models/payOutModel.js")
const Transaction = require("../../models/transactionModel.js");
const userModel = require("../../models/userModel.js");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, applyServiceCharges, logApiCall } = require("../../utils/chargeCaluate.js");
const { distributeCommission } = require("../../utils/distributerCommission.js");


function getPaysprintHeaders() {
  return {
    Token: generatePaysprintJWT(),
    Authorisedkey: "MjE1OWExZTIwMDFhM2Q3NGNmZGE2MmZkN2EzZWZkODQ=" // apna actual key
  };
}

const generateReferenceId = () => {
  const timestamp = Date.now().toString(36); // Short base36 timestamp
  const randomStr = Math.random().toString(36).substring(2, 8); // Random string
  return `REF${timestamp}${randomStr}`.toUpperCase();
};

exports.hlrCheck = async (req, res, next) => {
  const { number, type } = req.body;
  try {
    const apiUrl = "https://api.paysprint.in/api/v1/service/recharge/hlrapi/hlrcheck";
    const requestData = {
      number,
      type
    };
    const response = await axios.post(apiUrl, requestData, { headers });

    logApiCall({

      url: apiUrl,
      requestData,
      responseData: response.data
    });

    return res.status(200).json({
      data: response.data
    });
  } catch (error) {
    next(error);
  }
};

exports.browsePlan = async (req, res, next) => {
  const { circle, op } = req.query;
  try {
    const apiUrl = "https://api.paysprint.in/api/v1/service/recharge/hlrapi/browseplan";
    const requestData = {
      circle,
      op
    };
    const response = await axios.post(apiUrl, requestData, { headers });
    logApiCall({
      url: apiUrl,

      requestData,
      responseData: response.data
    });

    return res.status(200).json({
      data: response.data
    });
  } catch (error) {
    next(error);
  }
};

exports.dthPlan = async (req, res, next) => {
  const { canumber, op } = req.body;
  try {
    const apiUrl = "https://api.paysprint.in/api/v1/service/recharge/hlrapi/dthinfo";
    const requestData = {
      canumber,
      op
    };
    const response = await axios.post(apiUrl, requestData, { headers });

    logApiCall({
      url: apiUrl,

      requestData,
      responseData: response.data
    });

    return res.status(200).json(response.data);
  } catch (error) {
    return next(error);
  }
};

exports.getOperatorList = async (req, res, next) => {
  try {
    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/recharge/recharge/getoperator",
      {},
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/recharge/recharge/getoperator",


      requestData: req.body,
      responseData: response.data
    });


    if (response.data?.responsecode === 1) {
      req.operators = response.data.data;

      return res.status(200).json({
        status: "success",
        message: "Operator List Fetched",
        data: response.data.data,
      });
    } else {
      return res.status(200).json({
        status: "success",
        message: "No Operator Found",
        data: []
      });
    }
  } catch (error) {
    next(error);
  }
};









exports.doRecharge = async (req, res, next) => {
  const { operator: operatorName, canumber, amount, category, mpin } = req.body;
  const userId = req.user.id;

  if (!operatorName || !canumber || !amount || !category || !mpin) {
    return res.status(400).json({ status: "fail", message: "Missing required fields" });
  }

  const referenceid = `REF${Date.now()}`;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("🔁 Starting Recharge Flow...");

    // ✅ Get service charges
    const commissions = await getApplicableServiceCharge(userId, category === "mobile" ? "Mobile Recharge" : "Dth Recharge");
    console.log("💰 Service charges & meta:", commissions);

    // ✅ Apply base service charges
    const charges = applyServiceCharges(amount, commissions);
    console.log("💸 Charges applied:", charges);

    // ✅ Check for slabs
    let commission = { retailer: 0, distributor: 0, admin: 0, totalCommission: 0 };

    if (commissions.slabs && commissions.slabs.length > 0) {
      // Slabs present → calculate from slabs
      commission = calculateCommissionFromSlabs(amount, commissions.slabs, commissions.gst || 18, commissions.tds || 5);
      console.log("✅ Slab commission used:", commission);
    } else {
      // No slabs → fallback to service commissions
      commission = {
        retailer: 0,
        distributor: commissions.distributorCommission || 0,
        admin: commissions.adminCommission || 0,
        gst: 0,
        tds: 0,
        totalCommission: (commissions.distributorCommission || 0) + (commissions.adminCommission || 0)
      };
      console.log("⚠️ Slabs not found. Using service commissions only:", commission);
    }

    const user = await userModel.findOne({ _id: userId, mpin }).session(session);
    if (!user || user.eWallet < (amount + charges.totalDeducted)) {
      throw new Error("Wrong mpin or Insufficient wallet balance");
    }

    // ✅ Deduct from wallet
    user.eWallet -= (amount + charges.totalDeducted);
    await user.save({ session });
    console.log("💳 Wallet debited. Balance:", user.eWallet);

    // ✅ Create debit transaction
    const debitTxn = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: (amount + charges.totalDeducted),
      balance_after: user.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: referenceid,
      description: `Recharge for ${canumber} (${operatorName})`,
      status: "Pending"
    }], { session });
    console.log("📝 Debit transaction created:", debitTxn[0]._id);

    // ✅ Get operator
    const operatorRes = await axios.post("https://api.paysprint.in/api/v1/service/recharge/recharge/getoperator", {}, { headers });
    logApiCall({ url: "getoperator", requestData: {}, responseData: operatorRes.data });
    console.log("🔎 Operator response:", operatorRes.data);

    if (operatorRes.data?.responsecode !== 1) {
      throw new Error("Operator lookup failed");
    }

    const operator = operatorRes.data?.data?.find(op => op.name.toLowerCase() === operatorName.toLowerCase());
    if (!operator) throw new Error("Invalid operator name");

    const operatorId = operator.id;

    // ✅ Create recharge record
    const rechargeRecord = await BbpsHistory.create([{
      userId,
      rechargeType: category,
      operator: operatorName,
      customerNumber: canumber,
      amount,
      charges: charges.totalDeducted,
      transactionId: referenceid,
      extraDetails: { mobileNumber: canumber },
      status: "Pending"
    }], { session });
    console.log("🗂️ Recharge record created:", rechargeRecord[0]._id);

    // ✅ Do recharge
    const rechargeRes = await axios.post("https://api.paysprint.in/api/v1/service/recharge/recharge/dorecharge", {
      operator: operatorId, canumber, amount, referenceid
    }, { headers });

    logApiCall({ url: "dorecharge", requestData: req.body, responseData: rechargeRes.data });
    console.log("📲 Recharge API response:", rechargeRes.data);

    const { response_code, message } = rechargeRes.data;
    let status = "Failed";

    if (response_code === 1) status = "Success";
    else if ([0, 2].includes(response_code)) status = "Pending";

    rechargeRecord[0].status = status;
    await rechargeRecord[0].save({ session });
    console.log("🔄 Recharge record status updated:", status);

    debitTxn[0].status = status;
    await debitTxn[0].save({ session });
    console.log("✅ Transaction status updated:", status);

    // ✅ Refund if failed
    if (status === "Failed") {
      user.eWallet += (amount + charges.totalDeducted);
      await user.save({ session });
      console.log("💰 Refund completed. Wallet:", user.eWallet);

      await Transaction.create([{
        user_id: userId,
        transaction_type: "credit",
        amount: (amount + charges.totalDeducted),
        balance_after: user.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: `${referenceid}-refund`,
        description: `Refund for failed recharge to ${canumber} (${operatorName})`,
        status: "Success"
      }], { session });

      rechargeRecord[0].status = "Refunded";
      await rechargeRecord[0].save({ session });
      console.log("♻️ Recharge marked as refunded");
    }

    // ✅ Create payout and distribute commission if success
    if (status === "Success") {
      const newPayOut = new PayOut({
        userId,
        amount,
        reference: referenceid,
        account: null,
        trans_mode: "WALLET",
        ifsc: null,
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: charges.totalDeducted,
        remark: `Recharge for ${canumber}`
      });
      await newPayOut.save({ session });
      console.log("🏦 Payout entry created");

      await distributeCommission({
        distributer: user.distributorId,
        service: category === "mobile" ? "Mobile Recharge" : "Dth Recharge",
        amount,
        commission,
        reference: referenceid,
        description: `Commission for recharge of ${canumber}`
      });
      console.log("💸 Commission distributed");
    }

    await session.commitTransaction();
    session.endSession();
    console.log("✅ Recharge transaction committed successfully");

    return res.status(status === "Success" ? 200 : 400).json({
      status: status.toLowerCase(),
      message: message || `Recharge ${status.toLowerCase()}`,
      refid: referenceid
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error in doRecharge:", err);
    return next(err);
  }
};

exports.checkRechargeStatus = async (req, res, next) => {
  const { transactionId } = req.params;

  try {
    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/recharge/recharge/status",
      {
        referenceid: transactionId,
      },
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/recharge/recharge/status",

      requestData: req.params,
      responseData: response.data
    });
    const resData = response.data;
    if (resData.status === true) {
      const txnStatus = resData.data?.status;

      if (txnStatus === 1) {
        return res.status(200).json({
          status: "success",
          message: "Recharge successful",
          data: resData.data,
        });
      } else if (txnStatus === 0) {
        return res.status(200).json({
          status: "failed",
          message: "Recharge failed",
          data: resData.data,
        });
      } else {
        return res.status(200).json({
          status: "pending",
          message: "Recharge status pending",
          data: resData.data,
        });
      }
    } else {
      return res.status(400).json({
        status: "fail",
        message: "Status API returned failure",
        data: resData,
      });
    }
  } catch (error) {
    next(error);
  }
};

exports.getBillOperatorList = async (req, res) => {
  const headers = getPaysprintHeaders();

  
  const { mode = "online" } = req.body;
  try {
    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/bill-payment/bill/getoperator",
      { mode },
      { headers }
    );
    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/getoperator",

      requestData: req.body,
      responseData: response.data
    });

    const data = response.data;
    if (data.response_code === 1) {
      return res.status(200).json(data);
    }
    if (data.response_code === 2) {
      return res.status(200).json(data);
    }
    return res.status(400).json(data);
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.response?.data?.message || "Failed to fetch bill operator list",
      error: error.message,
    });
  }
};

exports.fetchBillDetails = async (req, res) => {
  const { operator, canumber, mode = "online", ...extraFields } = req.body;

  if (!operator || !canumber) {
    return res.status(400).json({ status: "fail", message: "Missing required fields: operator, canumber" });
  }

  try {
    const headers = getPaysprintHeaders();
    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/bill-payment/bill/fetchbill",
      { operator, canumber, mode, ...extraFields },
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/fetchbill",

      requestData: req.body,
      responseData: response.data
    });

    const data = response.data;
    if (data.response_code === 1) {
      return res.status(200).json({ ...data, status: "success", message: "Bill fetched successfully" });
    }
    if ([2, 3, 4, 7, 8, 9, 11].includes(data.response_code)) {
      return res.status(200).json({ ...data, status: "info", message: data.message || "Info" });
    }
    return res.status(400).json({ ...data, status: "fail", message: data.message || "Bill fetch failed" });
  } catch (error) {

    console.log(error);

    return res.status(500).json({
      status: "error",
      message: error.response?.data?.message || "Bill fetch API failed",
      error: error.message,
    });
  }
};

exports.payBill = async (req, res, next) => {
  const { operator, canumber, amount, referenceid, latitude, longitude, mode = "online", bill_fetch, mpin } = req.body;
  if (!operator || !canumber || !amount || !referenceid || !latitude || !longitude || !bill_fetch) {
    return res.status(400).json({ status: "fail", message: "Missing required fields" });
  }
  const userId = req.user.id;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {

    let commissions = await getApplicableServiceCharge(userId, "Bill Payment")
    const charges = applyServiceCharges(amount, commissions)
    const user = await userModel.findOne({ _id: userId, mpin }).session(session);
    if (!user || user.eWallet < (Number(amount) + Number(charges.totalDeducted))) {
      throw new Error("Wrong mpin or Insufficient wallet balance");
    }

    user.eWallet -= (Number(amount) + Number(charges.totalDeducted));
    await user.save({ session });

    const debitTxn = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: (Number(amount) + Number(charges.totalDeducted)),
      balance_after: user.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: referenceid,
      description: `Bill payment for ${canumber} (${operator})`,
      status: "Pending"
    }], { session });

    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/bill-payment/bill/paybill",
      { operator, canumber, amount, referenceid, latitude, longitude, mode, bill_fetch },
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/paybill",

      requestData: req.body,
      responseData: response.data
    });
    const { response_code, message } = response.data;

    let status;
    if (response_code === 1) status = "Success";
    else if (response_code === 0) status = "Pending";
    else if ([9, 14].includes(response_code)) status = "Failed";
    else status = "Failed";

    // Update debit txn
    debitTxn[0].status = status;
    await debitTxn[0].save({ session });

    // Store history
    await BbpsHistory.create([{
      userId, rechargeType: "bill payment", operator, customerNumber: canumber, amount, charges: charges.totalDeducted,
      transactionId: referenceid,
      extraDetails: bill_fetch, status
    }], { session });

    if (status === "Failed") {
      user.eWallet += (Number(amount) + Number(charges.totalDeducted));
      await user.save({ session });
      await Transaction.create([{
        user_id: userId,
        transaction_type: "credit",
        amount: (Number(amount) + Number(charges.totalDeducted)),
        balance_after: user.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: `${referenceid}-refund`,
        description: `Refund for failed bill payment to ${canumber} (${operator})`,
        status: "Success"
      }], { session });
    }
    if (status === "Success") {
      const newPayOut = new PayOut({
        userId,
        amount,
        reference: referenceid,
        account: null,
        trans_mode: "WALLET" || "IMPS",
        ifsc: null,
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: charges.totalDeducted,
        remark: `Bill payment for ${canumber} (${operator})`
      });
      await newPayOut.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(status === "Success" || status === "Pending" ? 200 : 400)
      .json({ status: status.toLowerCase(), message: message || status, refid: referenceid });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
};

exports.checkBillPaymentStatus = async (req, res, next) => {
  const { referenceid } = req.body;

  if (!referenceid) {
    return res.status(400).json({ status: "fail", message: "Missing required field: referenceid" });
  }

  try {
    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/bill-payment/bill/status",
      { referenceid },
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/bill-payment/bill/status",

      requestData: req.body,
      responseData: response.data
    });

    const data = response.data;
    if (data.status === true) {
      const statusMap = { 0: "failed", 1: "success", 2: "pending" };
      const txnStatus = data.data?.status;
      return res.status(200).json({
        status: statusMap[txnStatus] || "unknown",
        message: txnStatus === 1 ? "Bill payment successful" : txnStatus === 0 ? "Bill payment failed" : "Bill payment status pending",
        data,
      });
    }
    return res.status(400).json({ status: "fail", message: "Status fetch failed", data });
  } catch (error) {
    return next(error)
  }
};
