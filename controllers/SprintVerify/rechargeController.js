const axios = require("axios");
require("dotenv").config();
const { v4: uuid } = require("uuid");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate.js");
const BbpsHistory = require("../../models/bbpsModel.js");
const PayOut = require("../../models/payOutModel.js")
const Transaction = require("../../models/transactionModel.js");
const userModel = require("../../models/userModel.js");
const mongoose = require("mongoose");
const { getApplicableServiceCharge, applyServiceCharges, logApiCall, calculateCommissionFromSlabs, generateRandomCashback } = require("../../utils/chargeCaluate.js");
const { distributeCommission } = require("../../utils/distributerCommission.js");
const CommissionTransaction = require("../../models/CommissionTransaction.js");
const scratchCouponModel = require("../../models/scratchCoupon.model.js");
const redis = require("../../middleware/redis.js");
const { acquireLock, releaseLock } = require("../../middleware/redisValidation.js");


function getPaysprintHeaders() {
  return {
    Token: generatePaysprintJWT(),
    Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_P
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
    const headers = getPaysprintHeaders();
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
    const headers = getPaysprintHeaders();
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
    const headers = getPaysprintHeaders();
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
    const headers = getPaysprintHeaders();
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

  const referenceid = `REF${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
  const session = await mongoose.startSession();
  session.startTransaction();
  // 🔐 LOCK VARIABLES (scope ke liye)
  let rechargeLockKey, rechargeLockValue; //setex ke liye lock key and lock value
  let walletLockKey, walletLockValue; //setex ke liye lock key and lock value
  let shouldReleaseRechargeLock = true;
  try {
    console.log("🔁 Starting Recharge Flow...");
    // ✅ Get service charges
    const { commissions, service } = await getApplicableServiceCharge(userId, category, operatorName);
    // console.log("💰 Service charges & meta:", commissions);


    // ✅ Check for slabs
    let commission = commissions?.slabs?.length
      ? calculateCommissionFromSlabs(amount, commissions, operatorName)
      : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

    const user = await userModel.findOne({ _id: userId }).session(session);

    if (user.mpin != mpin) {
      throw new Error("Invalid mpin ! Please enter a vaild mpin");
    }
    if (redis) {
      rechargeLockKey = `recharge_lock:${userId}:${operatorName}:${canumber}:${amount}`;
      rechargeLockValue = uuid();

      const rechargeLocked = await acquireLock(rechargeLockKey, rechargeLockValue, 120);

      if (!rechargeLocked) {
        return res.status(429).json({
          success: false,
          message: "Same recharge already in progress please wait some tims(s)",
        });
      }
    }


    const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const retailerBenefit = user.role === "User" ? 0 : Number(commission.retailer || 0);
    const required = Number((
      Number(amount) +
      Number(commission.charge || 0) +
      Number(commission.gst || 0) + Number(commission.tds || 0) - Number(retailerBenefit || 0)
    ).toFixed(2));

    if (usableBalance < required) {
      return res.status(400).json({
        error: true,
        message: `Insufficient wallet balance. You must maintain ₹${user.cappingMoney} in your wallet. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`
      });

    }

    if (redis) {
      walletLockKey = `wallet_lock:${userId}`;
      walletLockValue = uuid();
      const walletLocked = await acquireLock(walletLockKey, walletLockValue, 5);
      if (!walletLocked) {
        throw new Error("Wallet busy, please retry in few seconds");
      }
    }

    // ✅ Deduct from wallet

    const updateUser = await userModel.findByIdAndUpdate(
      userId,
      { $inc: { eWallet: -required } },
      { new: true, session }
    );

    // ✅ Create debit transaction
    const debitTxn = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: Number(amount),
      type: service._id,
      gst: Number(commission.gst),
      tds: Number(commission.tds),
      charge: Number(commission.charge),
      totalDebit: Number(required),
      totalCredit: user.role === "User" ? 0 : Number(commission.retailer || 0),
      balance_after: updateUser.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: referenceid,
      description: `Recharge for ${canumber} (${operatorName})`,
      status: "Pending",
      provider: "paySprint",
    }], { session });

    const rechargeRecord = await BbpsHistory.create([{
      userId,
      rechargeType: service?._id,
      operator: operatorName,
      customerNumber: canumber,
      amount: Number(amount),

      charges: Number(commission.charge || 0),

      retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

      distributorCommission: Number(commission.distributor || 0),

      adminCommission: Number(commission.admin || 0),

      gst: Number(commission.gst || 0),
      tds: Number(commission.tds || 0),
      totalCommission: Number(commission.totalCommission || 0),
      totalDebit: Number(required),

      transactionId: referenceid,
      extraDetails: { mobileNumber: canumber },
      status: "Pending",
      provider: "paySprint",
    }], { session });

    const headers = getPaysprintHeaders();

    const operatorRes = await axios.post("https://api.paysprint.in/api/v1/service/recharge/recharge/getoperator", {}, { headers });
    logApiCall({ url: "getoperator", requestData: {}, responseData: operatorRes.data });


    if (operatorRes.data?.responsecode !== 1) {
      throw new Error("Operator lookup failed");
    }

    const operator = operatorRes.data?.data?.find(op => op.name.toLowerCase() === operatorName.toLowerCase());
    if (!operator) throw new Error("Invalid operator name");

    const operatorId = operator.id;
    const headers2 = getPaysprintHeaders();
    // ✅ Do recharge
    const rechargeRes = await axios.post("https://api.paysprint.in/api/v1/service/recharge/recharge/dorecharge", {
      operator: operatorId, canumber, amount, referenceid
    }, { headers: headers2 });

    logApiCall({ url: "dorecharge", requestData: req.body, responseData: rechargeRes.data });
    console.log("📲 Recharge API response:", rechargeRes.data);
    console.log(rechargeRes);

    const { response_code, message } = rechargeRes.data;
    let status = "Failed";

    if (response_code === 1) status = "Success";
    else if ([0, 2].includes(response_code)) status = "Pending";

    console.log("🔄 Recharge record status updated:", status);

    rechargeRecord[0].status = status;
    await rechargeRecord[0].save({ session });
    debitTxn[0].status = status;
    await debitTxn[0].save({ session });
    console.log("✅ Transaction status updated:", status);

    let finalUser = updateUser;

    // ✅ Refund if failed
    if (status === "Failed") {
      finalUser = await userModel.findByIdAndUpdate(
        userId,
        { $inc: { eWallet: required } },
        { new: true, session }
      );

      rechargeRecord[0].status = "Failed";
      await rechargeRecord[0].save({ session });

      debitTxn[0].status = status;
      debitTxn[0].balance_after = finalUser.eWallet;
      await debitTxn[0].save({ session });
      console.log("♻️ Recharge marked as refunded");
    }


    if (status === "Success") {
      const newPayOut = new PayOut({
        userId,
        amount: Number(amount),
        reference: referenceid,
        type: service._id,
        trans_mode: "WALLET",
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: commission.charge || 0,
        gst: commission.gst || 0,
        tds: commission.tds || 0,
        totalDebit: required,
        remark: `Recharge for ${canumber}`
      });
      await newPayOut.save({ session });
      console.log("🏦 Payout entry created");

      if (user.role === "User") {
        const retailerCommission = Number(commission.retailer || 0);

        if (retailerCommission > 0) {

          const cashbackAmount = generateRandomCashback(retailerCommission);

          if (cashbackAmount > 0) {
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1);

            await scratchCouponModel.findOneAndUpdate(
              { serviceTxnId: referenceid },
              {
                $setOnInsert: {
                  userId,
                  serviceTxnId: referenceid,
                  serviceName: "Recharge",
                  baseAmount: required,
                  cashbackAmount,
                  expiresAt: expiry,
                }
              },
              { upsert: true, session }
            );

          }
        }
      } else {
        await CommissionTransaction.create([{
          referenceId: referenceid,
          service: service._id,
          baseAmount: Number(amount),
          charge: Number(commission.charge),
          netAmount: Number(required),
          roles: [
            {
              userId,
              role: "Retailer",
              commission: commission.retailer || 0,
              chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
            },
            { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
            { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
          ],
          type: "credit",
          status: "Success",
          sourceRetailerId: userId,
          commissionDistributed: true,
        }], { session });

        console.log("💸 CommissionTransaction created for all roles");

        await distributeCommission({
          user: userId,
          distributer: user.distributorId,
          service: service,
          amount,
          commission,
          reference: referenceid,
          description: `Commission for recharge of ${canumber}`,
          session
        });
        console.log("💸 Commission distributed");
        if (status === "Success") {
          rechargeRecord[0].commissionDistributed = true;
          await rechargeRecord[0].save({ session });
        }

      }

    }


    if (
      status === "Success" &&
      user.role === "User" &&
      user.referredBy &&
      !user.referralRewardGiven &&
      Number(amount) >= 50
    ) {
      const referrerReward = 50;
      const newUserReward = 20;


      const referrer = await userModel.findByIdAndUpdate(
        user.referredBy,
        {
          $inc: {
            eWallet: referrerReward,
            referralCount: 1,
            referralEarnings: referrerReward,
          },
        },
        { new: true, session }
      );

      const rewardedUser = await userModel.findByIdAndUpdate(
        userId,
        {
          $inc: { eWallet: newUserReward },
          $set: { referralRewardGiven: true },
        },
        { new: true, session }
      );

      await Transaction.create([
        {
          user_id: referrer._id,
          transaction_type: "credit",
          type2: "Refer & Earn",
          amount: referrerReward,
          totalCredit: referrerReward,
          balance_after: referrer.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: `REFERRER-${referenceid}`,
          description: "Referral reward (first successful transaction)",
          status: "Success",
        },
        {
          user_id: rewardedUser._id,
          transaction_type: "credit",
          type2: "Refer & Earn",
          amount: newUserReward,
          totalCredit: newUserReward,
          balance_after: rewardedUser.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: `USER-${referenceid}`,
          description: "Signup referral reward",
          status: "Success",
        },
      ], { session });
    }

    let scratchCoupon = null;

    if (status === "Success" && user.role === "User") {
      scratchCoupon = await scratchCouponModel.findOne(
        { serviceTxnId: referenceid },
        { _id: 1, cashbackAmount: 1, createdAt: 1 }
      ).session(session);
    }
    if (status === "Pending") {
      shouldReleaseRechargeLock = false;
    }

    await session.commitTransaction();
    console.log("✅ Recharge transaction committed successfully");

    return res.status(status === "Success" ? 200 : status === "Pending" ? 202 : 400).json({
      status: status.toLowerCase(),
      message: response_code === 16 ? "Finunique service is under maintenance. Kindly try again after some time." : message || `Recharge ${status.toLowerCase()}`,
      refid: referenceid,
      scratchCoupon
    });

  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Error in doRecharge:", err);
    return next(err);
  } finally {
    // RECHARGE LOCK RELEASE (SAFE)
    if (redis && rechargeLockKey && rechargeLockValue && shouldReleaseRechargeLock) {
      await releaseLock(rechargeLockKey, rechargeLockValue);
    }
    session.endSession();
  }
};


exports.checkRechargeStatus = async (req, res, next) => {
  const { transactionId } = req.params;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1️⃣ Recharge fetch
    const recharge = await BbpsHistory.findOne(
      { transactionId },
      null,
      { session }
    );
    const transaction = await Transaction.findOne(
      { transaction_reference_id: transactionId },
      null,
      { session }
    );

    if (!recharge || !transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "failed",
        message: "Transaction not found",
      });
    }
    console.log("Transaction", recharge, transaction)

    // 2️⃣ FINAL state → skip API
    if (["Success", "Refunded", "Failed"].includes(recharge.status)) {
      await session.commitTransaction();
      return res.status(200).json({
        status: recharge.status.toLowerCase(),
        message:
          recharge.status === "Success"
            ? "Your Recharge Already successful" :
            recharge.status === "Refunded" ?
              "Recharge failed. Amount Already has been refunded." : "Your recharge Failed",
        data: recharge,
      });
    }

    // 3️⃣ Gateway call (sirf Pending)
    const headers = getPaysprintHeaders();

    const response = await axios.post(
      "https://api.paysprint.in/api/v1/service/recharge/recharge/status",
      { referenceid: transactionId },
      { headers }
    );

    logApiCall({
      url: "https://api.paysprint.in/api/v1/service/recharge/recharge/status",
      requestData: { referenceid: transactionId },
      responseData: response.data,
    });

    const apiRes = response.data;
    console.log("apiResapiRes", apiRes)

    if (!apiRes.status) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "failed",
        message: "Unable to fetch status from service",
        data: apiRes,
      });
    }

    const txnStatus = String(apiRes.data?.status);
    console.log("txnStatus", txnStatus)

    // =====================
    // 4️⃣ SUCCESS
    // =====================
    const user = await userModel.findById(
      recharge.userId,
      null,
      { session }
    ).select({
      eWallet: 1,
      name: 1,
      email: 1,
      mobileNumber: 1,
      role: 1,
      distributorId: 1,
    })

    if (txnStatus === "1" && recharge.status === "Pending" && !recharge.commissionDistributed) {
      recharge.status = "Success";
      transaction.status = "Success";
      await recharge.save({ session });
      await transaction.save({ session });
      console.log("user", user)
      const { commissions, service } = await getApplicableServiceCharge(recharge.userId, recharge.rechargeType, recharge.operator);
      console.log("💰 Service charges & meta:", commissions);

      // ✅ Check for slabs
      const commission = {
        retailer: recharge?.retailerCommission,
        distributor: recharge?.distributorCommission,
        admin: recharge?.adminCommission,
        charge: recharge?.charges,
        gst: recharge?.gst,
        tds: recharge?.tds,
      };

      const newPayOut = new PayOut({
        userId: recharge.userId || transaction.user_id,
        amount: Number(recharge.amount),
        reference: recharge.transactionId,
        type: recharge.rechargeType,
        trans_mode: "WALLET",
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: commission.charge || 0,
        gst: commission.gst || 0,
        tds: commission.tds || 0,
        totalDebit: recharge.totalDebit,
        remark: `Recharge for ${recharge?.extraDetails?.mobileNumber || ""}`
      });
      await newPayOut.save({ session });

      if (user.role === "User") {
        const retailerCommission = Number(commission.retailer || 0);

        if (retailerCommission > 0) {

          const cashbackAmount = generateRandomCashback(retailerCommission);

          if (cashbackAmount > 0) {
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1);

            await scratchCouponModel.findOneAndUpdate(
              { serviceTxnId: recharge.transactionId },
              {
                $setOnInsert: {
                  userId: recharge.userId || transaction.user_id,
                  serviceTxnId: recharge.transactionId,
                  serviceName: "Recharge",
                  baseAmount: Number(recharge.totalDebit),
                  cashbackAmount,
                  expiresAt: expiry,
                }
              },
              { upsert: true, session }
            );

          }
        }
      } else {
        await CommissionTransaction.create([{
          referenceId: recharge.transactionId,
          service: service._id,
          baseAmount: Number(recharge.totalDebit),
          charge: Number(commission.charge),
          netAmount: Number(recharge.totalDebit),
          roles: [
            {
              userId: recharge.userId || transaction.user_id,
              role: "Retailer",
              commission: commission.retailer || 0,
              chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
            },
            { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
            { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
          ],
          type: "credit",
          status: "Success",
          commissionDistributed: true,
          sourceRetailerId: recharge.userId || transaction.user_id,
        }], { session });

        console.log("💸 CommissionTransaction created for all roles");

        await distributeCommission({
          user: recharge.userId || transaction.user_id,
          distributer: user.distributorId,
          service: service,
          amount: recharge.amount,
          commission,
          reference: recharge.transactionId || transaction.transaction_reference_id,
          description: `Commission for recharge of ${recharge.extraDetails.mobileNumber || ""}`,
          session
        });
        console.log("💸 Commission distributed");
        recharge.commissionDistributed = true
        await recharge.save({ session });

      }
      await session.commitTransaction();
      return res.status(200).json({
        status: "Success",
        message: "Recharge is Success... have fun.",
        data: apiRes.data,
      });

    }

    let scratchCoupon = null;

    if (apiRes.data?.status == 1 && user.role === "User") {
      scratchCoupon = await scratchCouponModel.findOne(
        { serviceTxnId: recharge.transactionId },
        { _id: 1, cashbackAmount: 1, createdAt: 1 }
      ).session(session);
    }


    // ==================================
    // 5️⃣ FAILED + REFUNDED
    // ==================================
    if (txnStatus == "0" && apiRes.data?.refunded == "1") {

      // 🔐 Double refund protection
      if (recharge.status !== "Refunded") {

        // 5-A User wallet credit
        const updatedUser = await userModel.findByIdAndUpdate(
          recharge.userId,
          { $inc: { eWallet: recharge.totalDebit } },
          { new: true, session }
        );

        // 5-B SAME transaction record update (NO new report)
        await Transaction.updateOne(
          { transaction_reference_id: transactionId },
          {
            $set: {
              status: "Refunded",
              description: `Recharge failed – refund credited for ${recharge.customerNumber || ""}`,
              balance_after: updatedUser.eWallet,
            }
          },
          { session }
        );
        // 5-C Recharge report update
        recharge.status = "Refunded";
        await recharge.save({ session });
      }
      await session.commitTransaction();
      console.log("✅ Recharge transaction committed successfully");
      return res.status(200).json({
        status: "failed",
        message: "Recharge failed. Amount has been refunded to your wallet.",
        data: apiRes.data,
      });
    }

    // =====================
    // 6️⃣ STILL PENDING
    // =====================
    await session.commitTransaction();
    return res.status(200).json({
      status: "pending",
      message: "Recharge is still pending... Please Wait",
      data: apiRes.data,
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("checkRechargeStatus error:", error);
    next(error);
  } finally {
    session.endSession();
  }
};



// exports.checkRechargeStatus = async (req, res, next) => {
//   const { transactionId } = req.params;

//   try {

//     const headers = getPaysprintHeaders();
//     const response = await axios.post(
//       "https://api.paysprint.in/api/v1/service/recharge/recharge/status",
//       {
//         referenceid: transactionId,
//       },
//       { headers }
//     );

//     logApiCall({
//       url: "https://api.paysprint.in/api/v1/service/recharge/recharge/status",

//       requestData: req.params,
//       responseData: response.data
//     });
//     const resData = response.data;
//     if (resData.status === true) {
//       const txnStatus = resData.data?.status;

//       if (txnStatus === 1) {
//         return res.status(200).json({
//           status: "success",
//           message: "Recharge successful",
//           data: resData.data,
//         });
//       } else if (txnStatus === 0) {
//         return res.status(200).json({
//           status: "failed",
//           message: "Recharge failed",
//           data: resData.data,
//         });
//       } else {
//         return res.status(200).json({
//           status: "pending",
//           message: "Recharge status pending",
//           data: resData.data,
//         });
//       }
//     } else {
//       return res.status(400).json({
//         status: "fail",
//         message: "Status API returned failure",
//         data: resData,
//       });
//     }
//   } catch (error) {
//     next(error);
//   }
// };


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
