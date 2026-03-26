const { default: mongoose } = require("mongoose");
const dmtBeneficiary = require("../models/dmtBeneficiary");
const userModel = require("../models/userModel");
const { postEncrypted } = require("../services/iserveuClient");
const userMetaModel = require("../models/userMetaModel");
const { getApplicableServiceCharge, calculateCommissionFromSlabs, logApiCall } = require("../utils/chargeCaluate");
const payOutModel = require("../models/payOutModel");
const { distributeCommission } = require("../utils/distributerCommission");
const { default: admin } = require("../firebase");
const Transaction = require("../models/transactionModel");
const DmtReport = require("../models/dmtTransactionModel");
// 1) Get Customer
exports.getCustomer = async (req, res) => {
  console.log("✅ getCustomer API hit data", req.body);
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }
    const { latlong, publicIP } = req.body;
    if (!latlong || !publicIP) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "latlong & publicIP required" });

    const { data } = await postEncrypted("/common/dmt-lite/unified/customer/get-customer", {
      mobileNumber: user.mobileNumber,
      username: "upitestret",
      latlong,
      publicIP,
    });

    return res.json(data);
  } catch (err) {
    console.log(err);

    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 2) Send OTP
exports.sendOtp = async (req, res) => {
  try {
    console.log("📩 Incoming Send OTP Request Body:", req.body);

    const {
      requestedAmount,
      externalRefNumber,
      otpType,
      latLong,
      publicIP,
      ovdType,
      ovdData,
      pid,
      email,
      paramA, paramB, paramC,
    } = req.body;
    const username = "upitestret";
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }

    // 🧾 Input validations
    if (!/^\d{10}$/.test(user.mobileNumber)) {
      console.warn("❌ Invalid Mobile:", user.mobileNumber);
      return res.status(400).json({
        status: "FAILED",
        statusCode: "-1",
        statusDesc: "Invalid mobile",
      });
    }

    if (!username) {
      console.warn("❌ Missing Username");
      return res.status(400).json({
        status: "FAILED",
        statusCode: "-1",
        statusDesc: "Username required",
      });
    }

    if (!otpType) {
      console.warn("❌ Missing OTP Type");
      return res.status(400).json({
        status: "FAILED",
        statusCode: "-1",
        statusDesc: "otpType required",
      });
    }

    if (otpType === "1" && (!ovdType || !ovdData || !pid)) {
      console.warn("❌ Missing OVD fields for otpType=1");
      return res.status(400).json({
        status: "FAILED",
        statusCode: "-1",
        statusDesc: "ovdType, ovdData & pid required for otpType=1",
      });
    }

    if (otpType === "2" && !externalRefNumber) {
      console.warn("❌ Missing externalRefNumber for otpType=2");
      return res.status(400).json({
        status: "FAILED",
        statusCode: "-1",
        statusDesc: "externalRefNumber required for otpType=2",
      });
    }

    // ✅ Build payload
    const payload = {
      customerMobileNumber: user.mobileNumber,
      externalRefNumber: externalRefNumber || "",
      requestedAmount: requestedAmount || "",
      username,
      otpType,
      latLong: latLong || "",
      publicIP: publicIP || "",
      ovdType: ovdType || "",
      ovdData: ovdData || "",
      pid: pid || "",
      email: email || "",
      paramA: paramA || "",
      paramB: paramB || "",
      paramC: paramC || "",
    };

    console.log("📦 Final Payload for OTP API:", JSON.stringify(payload, null, 2));

    // 🔐 Call iServeU OTP API
    const { data } = await postEncrypted(
      "/common/dmt-lite/unified/otp/send",
      payload
    );

    console.log("✅ OTP API Response:", data);

    return res.json(data);
  } catch (err) {
    console.error("💥 sendOtp Controller Error:", err);
    return res.status(500).json({
      status: "FAILED",
      statusCode: "-500",
      statusDesc: err.message,
    });
  }
};


// 3) Process Customer Registration/Verification
exports.processCustomer = async (req, res) => {
  try {
    const {
      externalRefNumber, mobileNumber, name, address, pincode, ovdType, ovdData, otp,
      latlong, publicIP, paramA, paramB, paramC,
    } = req.body;

    if (!/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "Invalid mobile number" });
    }
    if (!otp) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "OTP required" });
    if (!latlong || !publicIP) {
      return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "username, latlong, publicIP required" });
    }

    const { data } = await postEncrypted("/common/dmt-lite/unified/customer/process-customer-registration", {
      externalRefNumber, mobileNumber, name, address: address || "", pincode: pincode || "",
      ovdType: ovdType || "", ovdData: ovdData || "",
      otp, username: "upitestret", latlong, publicIP,
      paramA: paramA || "", paramB: paramB || "", paramC: paramC || "",
    });

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 4) Beneficiary Verification
exports.verifyBeneficiary = async (req, res) => {
  try {
    const {
      externalRefNumber, accountNumber, beneBankName, beneMobileNumber, beneName,
      bankCode, beneIfscCode, transactionMode, customerName, customerMobileNumber,
      pincode, address, latLong, customerIP, otp,
      paramB, paramC,
    } = req.body;

    const required = { externalRefNumber, accountNumber, beneBankName, beneMobileNumber, beneName, bankCode, beneIfscCode, transactionMode, customerName, customerMobileNumber, latLong, customerIP, otp };
    for (const [k, v] of Object.entries(required)) {
      if (!v && v !== false) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: `${k} required` });
    }

    const payload = {
      externalRefNumber,
      accountNumber,
      beneBankName,
      beneMobileNumber,
      beneName,
      bankCode,
      beneIfscCode,
      transactionMode,
      customerName,
      customerMobileNumber,
      pincode: pincode || "",
      address: address || "",
      isHoldTransaction: false,
      username: "upitestret",
      latLong,
      customerIP,
      otp,
      paramB: paramB || "",
      paramC: paramC || "",
    };

    const { data } = await postEncrypted("/common/dmt-lite/unified/transaction/verify-bene", payload);

    if (data.status === "SUCCESS" && data["gateway-transaction-details"]?.[0].txnStausCode === "4") {
      const newBeneficiary = new dmtBeneficiary({
        user_id: req.user.id,
        provider: "iserveu",
        mobile: beneMobileNumber,
        benename: beneName,
        bankName: beneBankName,
        bankid: bankCode,
        accno: accountNumber,
        ifsccode: beneIfscCode,
        address: paramC,
        pincode: paramB,
        isVerified: true,
        type: "Dmt Beneficiary (iservU)"
      });
      await newBeneficiary.save();
    }
    return res.json(data);
  } catch (err) {
    console.log(err);

    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.response.data.statusDesc });
  }
};


exports.getBeneficiary = async (req, res) => {
  try {

    const beneficiaries = await dmtBeneficiary.find({
      user_id: req.user.id,
      provider: "iserveu"
    }).sort({ createdAt: -1 });

    return res.json({
      status: "SUCCESS",
      data: beneficiaries
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      status: "FAILED",
      statusCode: "-500",
      statusDesc: err.message
    });

  }
};

// 5) Money Transfer
exports.moneyTransfer = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const {
      externalRefNumber,
      requestedAmount,
      accountNumber,
      beneBankName,
      beneMobileNumber,
      beneName,
      bankCode,
      beneIfscCode,
      transactionMode,
      latLong,
      customerIP,
      otp,
      category = "68c936788fa1dda33eb541b0"
    } = req.body;

    const userId = req.user.id;

    // ---------------- USER ----------------

    const user = await userModel.findById(userId).session(session);
    const userMeta = await userMetaModel.findOne({ userId }).session(session);

    if (!user) throw new Error("User not found");

    // ---------------- SERVICE + COMMISSION ----------------

    const { commissions, service } =
      await getApplicableServiceCharge(userId, category);

    const commission = calculateCommissionFromSlabs(
      requestedAmount,
      commissions
    );

    const requiredAmount = Number(
      (
        Number(requestedAmount) +
        Number(commission.charge || 0) +
        Number(commission.gst || 0) +
        Number(commission.tds || 0) -
        Number(commission.retailer || 0)
      ).toFixed(2)
    );

    // ---------------- WALLET CHECK ----------------

    if (user.eWallet < requiredAmount) {

      return res.status(400).json({
        status: false,
        message: "Insufficient wallet balance"
      });

    }

    // ---------------- WALLET DEBIT ----------------

    const updatedUser = await userModel.findOneAndUpdate(
      { _id: userId, eWallet: { $gte: requiredAmount } },
      { $inc: { eWallet: -requiredAmount } },
      { new: true, session }
    );

    // ---------------- TRANSACTION RECORD ----------------

    await Transaction.create([{

      user_id: userId,
      transaction_type: "debit",
      type: service._id,
      amount: requestedAmount,
      gst: commission.gst,
      tds: commission.tds,
      charge: commission.charge,
      totalDebit: requiredAmount,
      totalCredit: commission.retailer || 0,
      balance_after: updatedUser.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: externalRefNumber,
      description: "DMT Transfer",
      status: "Pending",

    }], { session });

    // ---------------- PAYOUT RECORD ----------------

    await payOutModel.create([{

      userId,
      amount: requestedAmount,
      reference: externalRefNumber,
      trans_mode: transactionMode,
      type: service._id,
      name: user.name,
      mobile: user.mobileNumber,
      email: user.email,
      status: "Pending",
      charges: commission.charge,
      gst: commission.gst,
      tds: commission.tds,
      totalDebit: requiredAmount

    }], { session });

    // ---------------- PROVIDER API ----------------

    const payload = {
      externalRefNumber,
      requestedAmount: String(requestedAmount),
      accountNumber,
      beneBankName,
      beneMobileNumber,
      beneName,
      bankCode,
      beneIfscCode,
      transactionMode,
      customerName: user.name,
      customerMobileNumber: user.mobileNumber,
      latLong,
      customerIP,
      otp,
      username: "upitestret",
      isHoldTransaction: false
    };

    const { data } = await postEncrypted(
      "/common/dmt-lite/unified/transaction/moneytransfer-wb",
      payload
    );
    logApiCall({
      tag: "/common/dmt-lite/unified/transaction/moneytransfer-wb",
      requestData: payload,
      responseData: data,
    });
    // ---------------- SUCCESS ----------------

    if (data.status === "SUCCESS") {

      await DmtReport.create([{

        user_id: userId,
        status: "Success",
        type: service._id,
        txn_status: "1",
        ackno: data.txnReferenceId,
        referenceid: externalRefNumber,
        utr: data.poolReferenceId,
        benename: beneName,
        account_number: accountNumber,
        amount: requestedAmount,
        charges: commission.charge,
        gst: commission.gst,
        tds: commission.tds,
        totalDebit: requiredAmount,
        remitter: user.mobileNumber,
        provider: "iserveu",
        gatewayCharges: {
          txn_amount: parseFloat(requestedAmount),
          customercharge: parseFloat(commission.charge || 0),
          gst: parseFloat(commission.gst || 0),
          tds: parseFloat(commission.tds || 0),
          netcommission: parseFloat(
            commission.retailer +
            commission.distributor +
            commission.admin || 0
          ),
        },

      }], { session });

      await Transaction.updateOne(
        { transaction_reference_id: externalRefNumber },
        { $set: { status: "Success" } },
        { session }
      );

      await payOutModel.updateOne(
        { reference: externalRefNumber },
        { $set: { status: "Success" } },
        { session }
      );

      await distributeCommission({
        user: userId,
        distributer: user.distributorId,
        service,
        transferAmount: requestedAmount,
        commission,
        reference: externalRefNumber,
        description: "Commission for DMT Transaction",
        session
      });

    }

    // ---------------- FAILED ----------------

    else {

      await userModel.updateOne(
        { _id: userId },
        { $inc: { eWallet: requiredAmount } },
        { session }
      );

      throw new Error(data.statusDesc || "Transaction Failed");

    }

    await session.commitTransaction();

    // ---------------- NOTIFICATION ----------------

    if (userMeta?.fcm_Token) {
      try {
        await admin.messaging().send({
          token: userMeta.fcm_Token,
          notification: {
            title: "Finunique",
            body: `${requestedAmount} transferred to ${accountNumber}`
          },
        });
      } catch (err) {
        console.error("❌ FCM Send Error:", err.message);
      }
    }


    res.json({
      status: true,
      message: "Transaction Successful",
      data
    });

  } catch (err) {
    console.log(err);

    await session.abortTransaction();

    res.status(500).json({
      status: false,
      message: err.message
    });

  } finally {

    session.endSession();

  }

};

// 6) Status Check
exports.txnStatusReport = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const { externalRef, transactionDate } = req.body;

    if (!externalRef || !transactionDate) {
      return res.status(400).json({
        status: false,
        message: "externalRef and transactionDate required"
      });
    }

    // ---------------- FIND REPORT ----------------

    const report = await DmtReport.findOne({
      referenceid: externalRef
    }).session(session);

    if (!report) {
      return res.status(404).json({
        status: false,
        message: "Transaction not found"
      });
    }

    // ---------------- STATUS CHECK ----------------

    if (report.status === "Success" || report.status === "Failed") {

      await session.commitTransaction();

      return res.json({
        status: true,
        message: "Transaction already finalized",
        data: report
      });

    }

    // ---------------- CALL PROVIDER API ----------------

    const payload = {
      "$1": "DMT_txn_status_api",
      "$4": transactionDate,
      "$5": transactionDate,
      "$6": externalRef
    };

    const { data } = await postEncrypted(
      "/dmt/statuscheck/txnreport",
      payload
    );
    logApiCall({
      tag: "/dmt/statuscheck/txnreport",
      requestData: payload,
      responseData: data,
    });

    if (!data?.results?.length) {
      throw new Error("Invalid provider response");
    }

    const txn = data.results[0];

    // ---------------- SUCCESS CASE ----------------

    if (txn.status === "SUCCESS") {

      await DmtReport.updateOne(
        { referenceid: externalRef },
        {
          $set: {
            status: "Success",
            utr: txn.rrn,
            ackno: txn.txnId,
            txn_status: txn.txnStatusCode
          }
        },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        { $set: { status: "Success", bankRRN: txn.rrn } },
        { session }
      );

      await payOutModel.updateOne(
        { reference: externalRef },
        { $set: { status: "Success" } },
        { session }
      );

    }

    // ---------------- FAILED CASE ----------------

    else if (txn.status === "FAILED") {

      const transaction = await Transaction.findOne({
        transaction_reference_id: externalRef
      }).session(session);

      if (!transaction) throw new Error("Transaction not found");

      // Wallet refund

      await userModel.updateOne(
        { _id: transaction.user_id },
        { $inc: { eWallet: transaction.totalDebit } },
        { session }
      );

      await DmtReport.updateOne(
        { referenceid: externalRef },
        { $set: { status: "Failed", txn_status: txn.txnStatusCode } },
        { session }
      );

      await Transaction.updateOne(
        { transaction_reference_id: externalRef },
        { $set: { status: "Failed" } },
        { session }
      );

      await payOutModel.updateOne(
        { reference: externalRef },
        { $set: { status: "Failed" } },
        { session }
      );

    }

    // ---------------- PENDING CASE ----------------

    else {

      await DmtReport.updateOne(
        { referenceid: externalRef },
        {
          $set: {
            status: "Pending",
            txn_status: txn.txnStatusCode
          }
        },
        { session }
      );

    }

    await session.commitTransaction();

    return res.json({
      status: true,
      message: "Transaction status updated",
      data
    });

  } catch (err) {

    await session.abortTransaction();

    console.error("Status Check Error:", err);

    return res.status(500).json({
      status: false,
      message: err.message
    });

  } finally {

    session.endSession();

  }

};

// 7) Callback
exports.callback = async (req, res) => {
  try {
    console.log("Iservu DMT CallBack", req.body);

    const hClient = req.header("client_id");
    const hSecret = req.header("client_secret");
    if (hClient !== process.env.ISU_CLIENT_ID || hSecret !== process.env.ISU_CLIENT_SECRET) {
      return res.status(401).json({ status: 1, statusDesc: "Failure (unauthorized)" });
    }

    // body as plain JSON
    return res.json({ status: 0, statusDesc: "success" });
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};
