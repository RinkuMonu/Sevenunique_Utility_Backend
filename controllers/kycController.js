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
      await User.findByIdAndUpdate(
        userId,
        { $set: { aadharDetails: nameFromAadhar, isKycVerified: true } },
        { new: true }
      );

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
  const prefixList = ["Mr.", "Ms", "Mrs", "Dr"];
  prefixList.forEach((prefix) => {
    if (name.startsWith(prefix)) {
      name = name.replace(prefix, "").trim();
    }
  });
  name = name.toLowerCase().replace(/\s+/g, " ");
  return name;
};

const userVerify = async (req, res) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  console.log(user);
  if (!user) return res.status(404).send("User not found!");

  const normalizedAadharName = normalizeName(
    user.aadharDetails.data.full_name || ""
  );
  const normalizedPanName = normalizeName(user.panDetails.full_name || "");
  const normalizedBankName = normalizeName(user.bankDetails.account_name || "");

  console.log("🧾 Normalized Names:", {
    Aadhaar: normalizedAadharName,
    PAN: normalizedPanName,
    Bank: normalizedBankName,
  });

  if (
    normalizedAadharName === normalizedPanName &&
    normalizedPanName === normalizedBankName
  ) {
    user.isKycVerified = true;
    await user.save();
    return res.status(200).send("User verified successfully");
  }

  // user.aadharDetails = {};
  // user.panDetails = {};
  // user.bankDetails = {};
  user.isKycVerified = false;
  await user.save();

  return res
    .status(400)
    .send("Dismatched User details. Please correct the information.");
};

const updateBankAccount = async (req, res) => {
  const { id_number, ifsc } = req.body;
  console.log("🔄 Updating Bank Account:", id_number, ifsc);

  let user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const normalizedAadharName = normalizeName(
    user.aadharDetails.full_name || ""
  );
  const normalizedPanName = normalizeName(user.panDetails.full_name || "");

  if (!id_number || !ifsc) {
    return res
      .status(400)
      .json({ success: false, message: "IFSC number or ID is missing" });
  }

  try {
    const response = await axios.post(
      "https://kyc-api.surepass.io/api/v1/bank-verification/",
      { id_number, ifsc, ifsc_details: true },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TOKEN}`,
        },
      }
    );

    console.log("✅ Surepass Bank Verify Response:", response.data);

    const nameFromBank = response.data.data.full_name;
    const normalizedBankName = normalizeName(nameFromBank);

    if (
      normalizedAadharName === normalizedBankName &&
      normalizedPanName === normalizedBankName
    ) {
      user.bankDetails = response.data.data;
      await user.save();
      return res.status(200).json({
        success: true,
        message: "Bank details updated successfully",
        data: response.data,
      });
    } else {
      console.warn("❌ Name Mismatch with Aadhaar & PAN");
      return res.status(400).json({
        success: false,
        message: "Bank account name mismatch with Aadhaar & PAN",
      });
    }
  } catch (error) {
    console.error(
      "❌ Error updating bank account:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({ success: false, message: "Error updating bank details" });
  }
};

module.exports = {
  aadhaarVerify,
  submitAadharOTP,
  verifyBank,
  verifyPAN,
  userVerify,
  updateBankAccount,
};
