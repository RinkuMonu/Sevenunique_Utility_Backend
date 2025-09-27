const { postEncrypted } = require("../services/iserveuClient");

// 1) Get Customer
exports.getCustomer = async (req, res) => {
     console.log("✅ getCustomer API hit hua:", req.body);
  try {
    const { mobileNumber, username, latlong, publicIP } = req.body;
    if (!/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "Invalid mobile number" });
    }
    if (!username) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "Username required" });
    if (!latlong || !publicIP) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "latlong & publicIP required" });

    const { data } = await postEncrypted("/common/dmt-lite/unified/customer/get-customer", {
      mobileNumber,
      username,
      latlong,
      publicIP,
    });

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 2) Send OTP
exports.sendOtp = async (req, res) => {
  try {
    console.log("📩 Incoming Send OTP Request Body:", req.body);

    const {
      customerMobileNumber,
      externalRefNumber,
      requestedAmount,
      username,
      otpType,
      latLong,
      publicIP,
      ovdType,
      ovdData,
      pid,
      email,
      paramA, paramB, paramC,
    } = req.body;

    // 🧾 Input validations
    if (!/^\d{10}$/.test(customerMobileNumber)) {
      console.warn("❌ Invalid Mobile:", customerMobileNumber);
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
      customerMobileNumber,
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
      mobileNumber, name, address, pincode, ovdType, ovdData, otp,
      username, latlong, publicIP, paramA, paramB, paramC,
    } = req.body;

    if (!/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "Invalid mobile number" });
    }
    if (!otp) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "OTP required" });
    if (!username || !latlong || !publicIP) {
      return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: "username, latlong, publicIP required" });
    }

    const { data } = await postEncrypted("/common/dmt-lite/unified/customer/process-customer-registration", {
      mobileNumber, name, address: address || "", pincode: pincode || "",
      ovdType: ovdType || "", ovdData: ovdData || "",
      otp, username, latlong, publicIP,
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
      pincode, address, isHoldTransaction, username, latLong, customerIP, otp,
      paramB, paramC,
    } = req.body;

    const required = { externalRefNumber, accountNumber, beneBankName, beneMobileNumber, beneName, bankCode, beneIfscCode, transactionMode, customerName, customerMobileNumber, username, latLong, customerIP, otp };
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
      isHoldTransaction: !!isHoldTransaction,
      username,
      latLong,
      customerIP,
      otp,
      paramB: paramB || "",
      paramC: paramC || "",
    };

    const { data } = await postEncrypted("/common/dmt-lite/unified/transaction/verify-bene", payload);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 5) Money Transfer
exports.moneyTransfer = async (req, res) => {
  try {
    const {
      externalRefNumber, requestedAmount, accountNumber, beneBankName, beneMobileNumber,
      beneName, bankCode, beneIfscCode, transactionMode, customerName, customerMobileNumber,
      pincode, address, isHoldTransaction, username, latLong, customerIP, otp, paramB, paramC,
    } = req.body;

    const required = { externalRefNumber, requestedAmount, accountNumber, beneBankName, beneMobileNumber, beneName, bankCode, beneIfscCode, transactionMode, customerName, customerMobileNumber, username, latLong, customerIP, otp };
    for (const [k, v] of Object.entries(required)) {
      if (!v && v !== false) return res.status(400).json({ status: "FAILED", statusCode: "-1", statusDesc: `${k} required` });
    }

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
      customerName,
      customerMobileNumber,
      pincode: pincode || "",
      address: address || "",
      isHoldTransaction: !!isHoldTransaction,
      username,
      latLong,
      customerIP,
      otp,
      paramB: paramB || "",
      paramC: paramC || "",
    };

    const { data } = await postEncrypted("/common/dmt-lite/unified/transaction/moneytransfer-wb", payload);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 6) Status Check
exports.txnStatusReport = async (req, res) => {
  try {
    const { clientRefID, startDate, endDate } = req.body;

    if (!clientRefID || !startDate || !endDate) {
      return res.status(400).json({ status: 0, message: "clientRefID, startDate, endDate required" });
    }

    const payload = {
      "$1": "DMT_txn_status_api_lite_common",
      "$4": startDate,
      "$5": endDate,
      "$6": clientRefID,
    };

    const { data } = await postEncrypted("/redis-v2/statuscheck-report/txnreport", payload);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ status: "FAILED", statusCode: "-500", statusDesc: err.message });
  }
};

// 7) Callback
exports.callback = async (req, res) => {
  try {
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
