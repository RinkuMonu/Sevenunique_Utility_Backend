const { default: axios } = require("axios");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
require("dotenv").config();

function generateToken() {
  const token = jwt.sign(
    {},
    "18fc02b675bfa38fbb3350b18e0fc45cf3740bd3be6104e4d310188943d09535",
    {
      algorithm: "HS256",
    }
  );
  console.log("🔐 Generated JWT:", token);
  return token;
}

const aadhaarVerify = async (req, res, next) => {
  const { aadharNumber } = req.body;
  const id_number = aadharNumber;
  console.log("📩 Aadhaar OTP Request for:", id_number);

  if (!aadharNumber) return res.send("Aadhar Number is required");

  try {
    const generateOtpResponse = await axios.post(
      `https://api.7uniqueverfiy.com/api/verify/adhar/send/otp`,
      { id_number },
      {
        headers: {
          "client-id": "Seven012",
          authorization: `Bearer ${generateToken()}`,
          "x-env": "production",
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Aadhaar OTP API Response:", generateOtpResponse.data);

    return res.send({
      message: "OTP send successful",
      data: generateOtpResponse.data,
    });
  } catch (error) {
    console.error(
      "❌ Aadhaar OTP Send Error:",
      error.response?.data || error.message
    );
    return next(error);
  }
};

const submitAadharOTP = async (req, res) => {
  const { otp, client_id, userId } = req.body;
  console.log("📲 Submitting Aadhaar OTP:", otp);

  let user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  console.log(user);

  const requestData = { otp, client_id };

  try {
    const submitOtpResponse = await axios.post(
      `https://api.7uniqueverfiy.com/api/verify/adhar/verify/otp`,
      requestData,
      {
        headers: {
          "client-id": "Seven012",
          authorization: `Bearer ${generateToken()}`,
          "x-env": "production",
        },
      }
    );
    console.log("✅ Aadhaar OTP Submit Response:", submitOtpResponse.data);

    const nameFromAadhar = submitOtpResponse?.data?.data;

    if (
      submitOtpResponse.data &&
      submitOtpResponse.data.data &&
      submitOtpResponse.data.data.status === true
    ) {
      console.log("hii");

      const newData = await User.findByIdAndUpdate(
        userId,
        { aadharDetails: nameFromAadhar },
        { new: true }
      );
      console.log(newData);

      return res.status(200).json({
        message: "Aadhaar verification successful",
        data: submitOtpResponse.data,
        name: nameFromAadhar,
      });
    } else {
      console.log(
        "❌ Aadhaar verification failed response:",
        submitOtpResponse.data.data
      );
      return res.send("Aadhaar verification failed", submitOtpResponse.data);
    }
  } catch (error) {
    console.error(
      "❌ Aadhaar OTP Submit Error:",
      error.response?.data || error.message
    );
    return res.status(500).json({ message: "Error verifying Aadhaar OTP" });
  }
};

const verifyBank = async (req, res) => {
  const { id_number, ifsc, userId } = req.body;
  console.log("🏦 Verifying Bank for:", id_number, ifsc);

  let user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (!id_number || !ifsc) {
    console.warn("⚠️ Bank Verify: Missing id_number or ifsc");
    return res
      .status(400)
      .json({ success: false, message: "IFSC number or ID is missing" });
  }

  try {
    const response = await axios.post(
      "https://api.7uniqueverfiy.com/api/verify/bankVerify/v2",
      {
        account_number: id_number,
        ifsc_code: ifsc,
      },
      {
        headers: {
          "client-id": "Seven012",
          authorization: `Bearer ${generateToken()}`,
          "x-env": "production",
        },
      }
    );

    console.log("✅ Bank Verification Response:", response.data);

    const nameFromBank = response.data;
    user.bankDetails = nameFromBank.data.data;
    await user.save();

    return res
      .status(200)
      .json({ pandata: response.data, success: true, name: nameFromBank });
  } catch (error) {
    console.error(
      "❌ Error in verifyBank:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({ success: false, message: "Error verifying bank details" });
  }
};

const verifyPAN = async (req, res) => {
  const { id_number, userId } = req.body;

  console.log("🔍 PAN Verification Requested for:", id_number);

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!id_number)
      return res
        .status(400)
        .json({ success: false, message: "PAN number missing" });

    const response = await axios.post(
      "https://api.7uniqueverfiy.com/api/verify/pan_verify",
      { pannumber: id_number },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${generateToken()}`,
          "Client-id": "Seven012",
          "x-env": "production",
        },
      }
    );

    console.log("✅ PAN API Response:", response.data);

    const nameFromPAN = response.data.data;
    user.panDetails = nameFromPAN.data;
    await user.save();

    return res
      .status(200)
      .json({ success: true, name: nameFromPAN, data: response.data });
  } catch (error) {
    console.error(
      "❌ PAN Verification Error:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({ success: false, message: "Error verifying PAN details" });
  }
};

const normalizeName = (name) => {
  const prefixList = [
    "Mr.",
    "Ms.",
    "Ms",
    "Mrs",
    "Mrs.",
    "Dr",
    "Dr.",
    "Mr",
    "Miss",
  ];
  prefixList.forEach((prefix) => {
    if (name.startsWith(prefix)) {
      name = name.replace(prefix, "").trim();
    }
  });
  name = name.toLowerCase().replace(/\s+/g, " ");
  return name;
};

const userVerify = async (req, res) => {
  try {
    const { userId, fromApp } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send("User not found!");

    const normalizedAadharName = normalizeName(
      user?.aadharDetails?.data?.full_name || ""
    );
    const normalizedPanName = normalizeName(user?.panDetails?.full_name || "");
    const normalizedBankName = normalizeName(
      user?.bankDetails?.account_name || ""
    );

    if (
      normalizedAadharName === normalizedPanName &&
      normalizedPanName === normalizedBankName
    ) {
      user.isKycVerified = true;
      await user.save();

      const responseUser = {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        isKycVerified: user.isKycVerified,
        kycStatus: "Verified",
        bankName: user?.bankDetails?.account_name,
        panName: user?.panDetails?.full_name,
        aadharName: user?.aadharDetails?.data?.full_name,
      };

      if (fromApp) {
        return res.status(200).json({
          success: true,
          message: "User verified successfully",
          user: responseUser,
        });
      } else {
        return res.status(200).send("User verified successfully");
      }
    }

    user.isKycVerified = false;
    await user.save();

    const responseUser = {
      id: user._id,
      name: user.name,
      mobile: user.mobile,
      isKycVerified: user.isKycVerified,
      kycStatus: "Mismatch in details",
      bankName: user?.bankDetails?.account_name,
      panName: user?.panDetails?.full_name,
      aadharName: user?.aadharDetails?.data?.full_name,
    };

    if (fromApp) {
      return res.status(400).json({
        success: false,
        message: "Dismatched User details. Please correct the information.",
        user: responseUser,
      });
    } else {
      return res
        .status(400)
        .send("Dismatched User details. Please correct the information.");
    }
  } catch (err) {
    console.error("Error in userVerify:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

const updateBankAccount = async (req, res) => {
  const { id_number, ifsc } = req.body;
  console.log("🔄 Updating Bank Account:", id_number, ifsc);

  if (!id_number || !ifsc) {
    return res.status(400).json({
      success: false,
      message: "Account number & IFSC are required",
    });
  }

  const user = await User.findById(req.user.id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  // Normalize saved names
  const normalizedAadharName = normalizeName(
    user?.aadharDetails?.data?.full_name || ""
  );
  const normalizedPanName = normalizeName(user?.panDetails?.full_name || "");

  try {
    const response = await axios.post(
      "https://api.7uniqueverfiy.com/api/verify/bankVerify/v2",
      {
        account_number: id_number,
        ifsc_code: ifsc,
      },
      {
        headers: {
          "client-id": "Seven012",
          authorization: `Bearer ${generateToken()}`,
          "x-env": "production",
        },
      }
    );

    console.log("✅ Bank Verify Response:", response.data);

    const api = response.data;

    if (!api.success) {
      return res.status(400).json({
        success: false,
        message: "Service returned failure",
      });
    }

    if (
      api.data?.status !== true ||
      api.data?.statuscode !== 200 ||
      !api.data?.data
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid bank details provided",
      });
    }

    const bankData = api.data.data;
    const nameFromBank = bankData.account_name || "";
    const normalizedBankName = normalizeName(nameFromBank);

    if (
      normalizedAadharName === normalizedBankName &&
      normalizedPanName === normalizedBankName
    ) {
      user.bankDetails = bankData;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Bank details updated successfully",
        bankDetails: bankData,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Bank name mismatch with Aadhaar & PAN",
      aadharName: user?.aadharDetails?.data?.full_name,
      panName: user?.panDetails?.full_name,
      bankName: nameFromBank,
    });
  } catch (error) {
    console.error(
      "Error updating bank account:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: "Service under maintenance",
    });
  }
};

const verifyEmail7UniqueVerify = async (req, res) => {
  const { email } = req.body;
  console.log("📧 Verifying Email:", email);

  if (!email) {
    return res
      .status(201)
      .json({ success: false, message: "Email is required" });
  }

  try {
    const payload = { email };

    const resp = await axios.post(
      "https://control.msg91.com/api/v5/email/validate",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          authkey: process.env.MSG91_AUTH_KEY,
        },
      }
    );

    const api = resp.data;

    const result = api?.data;
    // MSG91 → api.data.valid, api.data.reason, api.data.did_you_mean

    console.log("✅ MSG91 Verification Response:", result);
    const normalizedResponse = {
      emailvalid:
        result?.result?.result?.toString().toLowerCase() === "deliverable"
          ? true
          : false,
      reason: {
        valid: result?.valid,
        valid_syntax: result?.valid_syntax,
        disposable: result?.disposable,
        role: result?.role,
        mx_found: result?.mx_found,
        smtp_check: result?.smtp_check,
        catch_all: result?.catch_all,
        did_you_mean: result?.did_you_mean || null,
      },
      message:
        result?.result?.result?.toString().toLowerCase()  === "deliverable"
          ? "valid Email and deliverable"
          : "invalid Email or undeliverable",
    };

    return res.status(200).json(normalizedResponse);
  } catch (error) {
    console.error("❌ Email Check Error:", error.response?.data || error);

    return res.status(400).json({
      success: false,
      message: "Email verify service on maintenance",
    });
  }
};

module.exports = {
  aadhaarVerify,
  submitAadharOTP,
  verifyBank,
  verifyPAN,
  userVerify,
  updateBankAccount,
  verifyEmail7UniqueVerify,
  generateToken,
};
