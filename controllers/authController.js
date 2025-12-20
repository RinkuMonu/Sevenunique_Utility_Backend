require("dotenv").config();
const User = require("../models/userModel.js");
const mongoose = require("mongoose");
const { generateOtp, verifyOtp } = require("../services/otpService");
const { sendOtp } = require("../services/smsService");
const { generateJwtToken } = require("../services/jwtService");
const { parse } = require("json2csv");
const userMetaModel = require("../models/userMetaModel.js");
const PayIn = require("../models/payInModel.js");
const PayOut = require("../models/payOutModel.js");
const AEPSWithdrawal = require("../models/aepsModels/withdrawalEntry.js");
const DmtReport = require("../models/dmtTransactionModel.js");
const BbpsHistory = require("../models/bbpsModel.js");
const { default: axios } = require("axios");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit-table");
const ExcelJS = require("exceljs");
const OTP = require("../models/otpModel");
const { getISTDayRange } = require("../services/timeZone.js");


// utils/getDeviceName.js

// const verifyEmail7Unique = async (email) => {
//   try {
//     const res = await axios.post(
//       "https://api.7uniqueverfiy.com/api/verify/email_checker_v1",
//       {
//         refid: `${Date.now()}`,
//         email,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "x-env": "production",
//           "client-id": "Seven012",
//           Authorization: `Bearer ${generateToken()}`,
//         },
//       }
//     );

//     const data = res?.data;

//     console.log("Email Verify Cron Response:", data);

//     if (!data) return { valid: false, reason: "no_response" };
//     return {
//       valid:
//         data?.data?.status &&
//         data?.data?.data?.valid_syntax &&
//         data?.data?.data?.valid,
//       reason: data?.data?.data?.status || "unknown",
//     };
//   } catch (err) {
//     console.error("Email Verify Cron Error:", err.message);
//     return { valid: false, reason: "api_error" };
//   }
// };




const verifyEmail7Unique = async (email) => {
  try {
    const res = await axios.post(
      "https://control.msg91.com/api/v5/email/validate",
      { email },
      {
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          authkey: process.env.MSG91_AUTH_KEY,
        },
      }
    );

    const result = res?.data?.data;

    console.log("Email Verify Cron (MSG91):", result);

    if (!result) return { valid: false, reason: "no_response" };

    const isDeliverable =
      result?.result?.result?.toString().toLowerCase() === "deliverable";

    return {
      valid: isDeliverable,
      reason: isDeliverable ? "deliverable" : "undeliverable",
    };
  } catch (err) {
    console.error("Email Verify Cron Error:", err.message);
    return { valid: false, reason: "api_error" };
  }
};

const getDeviceName = (userAgent = "") => {
  const ua = userAgent || "";

  // Detect Browser
  let browser = "Unknown Browser";
  browser = ua.includes("Chrome")
    ? "Chrome"
    : ua.includes("Firefox")
      ? "Firefox"
      : ua.includes("Safari") && !ua.includes("Chrome")
        ? "Safari"
        : ua.includes("Edg")
          ? "Edge"
          : "Unknown Browser";

  // Detect OS
  let os = "Unknown OS/device";
  os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Android")
      ? "Android"
      : ua.includes("iPhone")
        ? "iPhone"
        : ua.includes("Mac")
          ? "MacOS"
          : "Unknown OS";

  return `${browser} on ${os}`;
};

const sendLoginEmail = async (
  user,
  lat,
  long,
  pincode,
  ipAddress,
  deviceLocation,
  deviceName
) => {
  try {
    const check = await verifyEmail7Unique(user.email || "");
    if (!check.valid) {
      console.log("⚠ Skipping login email. Invalid email:", user.email);
      return;
    }
    console.log("✅ Email verified by 7Unique:", check);
    const loginTime = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const payload = {
      recipients: [
        {
          to: [
            {
              name: user?.name || "User",
              email: user?.email,
              // email: "niranjan@7unique.in",
            },
          ],
          variables: {
            userName: user?.name ?? "User",
            company_name: "Finunique Small Private Limited",
            loginTime: loginTime ?? "N/A",
            lat: lat ?? "N/A",
            long: long ?? "N/A",
            pincode: pincode ?? "N/A",
            ipAddress: ipAddress ?? "N/A",
            deviceLocation: deviceLocation ?? "N/A",
            deviceName: deviceName ?? "N/A",
            currentYear: new Date().getFullYear(),
          },
        },
      ],
      from: {
        name: "Finunique Small Private Limited",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      template_id: "login_notification_template",
    };
    // console.log("Login email payload:", payload.recipients[0].variables);
    try {
      const res = await axios.post(
        "https://control.msg91.com/api/v5/email/send",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            authkey: process.env.MSG91_AUTH_KEY,
          },
        }
      );
      console.log("✅ Login email sent", res.data);
    } catch (error) {
      console.error("❌ Error sending login email:", error.message);
    }

    console.log("✅ Login email sent to:", user.email);
  } catch (error) {
    console.error("❌ Error sending login email:", error.message);
  }
};

const sendOtpController = async (req, res) => {
  try {
    const { mobileNumber, isRegistered, ifLogin } = req.body;
    console.log("📩 Request Body:", req.body);

    // ✅ Validation
    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    // ✅ Find user once and reuse
    const userExisting = await User.findOne({ mobileNumber });

    // ✅ Register flow: stop if user already exists
    if (isRegistered === true) {
      if (userExisting) {
        return res.status(400).json({
          success: false,
          message: "User already registered",
        });
      }
    }

    // ✅ Login flow: stop if user does not exist
    if (ifLogin === true) {
      if (!userExisting) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
    }

    // ✅ Generate OTP
    const otp = await generateOtp(mobileNumber);

    // ✅ Send OTP
    const smsResult = await sendOtp(mobileNumber, otp);

    if (smsResult.success) {
      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        data: { mobileNumber }, // optional, can remove if you want
      });
    } else {
      return res.status(400).json({
        success: false,
        message: smsResult.message || "Failed to send OTP",
      });
    }
  } catch (error) {
    console.error("❌ Error in sendOtpController:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { mobileNumber, otp, outerRegister } = req.body;

    // ✅ Validation
    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }

    // ✅ Verify OTP
    const verificationResult = await verifyOtp(mobileNumber, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || "Invalid OTP",
      });
    }
    let user = await User.findOne({ mobileNumber });

    let nextStep = outerRegister ? 3 : 2;

    if (user) {
      if (user.name && user.email && user.password)
        nextStep = outerRegister ? 4 : 3;

      if (user.aadharDetails && Object.keys(user.aadharDetails).length > 0)
        nextStep = outerRegister ? 5 : 4;

      if (user.bankDetails && Object.keys(user.bankDetails).length > 0)
        nextStep = outerRegister ? 6 : 5;

      if (user.panDetails && Object.keys(user.panDetails).length > 0)
        nextStep = outerRegister ? 7 : 6;
    }
    const token = user
      ? generateJwtToken(user._id, user.role, user.mobileNumber)
      : null;

    // ✅ Success
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      userId: user ? user._id : null,
      nextStep,
      isExistingUser: !!user,
      token: token ? token : null,
      role: user ? user.role : null,
    });
  } catch (error) {
    console.error("❌ Error in verifyOTPController:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const loginController = async (req, res) => {
  try {
    const {
      mobileNumber,
      password,
      otp,
      lat,
      long,
      pincode,
      ipAddress,
      deviceLocation,
    } = req.body;
    if (!mobileNumber) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    const user = await User.findOne({ mobileNumber });
    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }

    if (user.status === false) {
      return res
        .status(403)
        .json({ message: "Your account is blocked. Please contact support." });
    }
    if (user.isKycVerified === false && user.role !== "User") {
      return res.status(403).json({
        message: "Your KYC is not verified. Please complete KYC to continue.",
      });
    }

    // ✅ OTP login
    if (otp) {
      const verificationResult = await verifyOtp(mobileNumber, otp);
      if (!verificationResult.success) {
        return res.status(400).json({ message: verificationResult.message });
      }
    }
    // ✅ Password login
    else if (password) {
      const isMatch = await user.comparePassword(password);

      if (!isMatch)
        return res.status(400).json({ message: "Invalid password" });
    } else {
      return res
        .status(400)
        .json({ message: "Password or OTP is required to login" });
    }

    // ✅ Generate JWT
    const token = generateJwtToken(user._id, user.role, user.mobileNumber);

    const deviceName = getDeviceName(req.headers["user-agent"]);

    sendLoginEmail(
      user,
      lat,
      long,
      pincode,
      ipAddress,
      deviceLocation,
      deviceName
    );
    await LoginHistory.create({
      userId: user._id ?? null,
      mobileNumber: user.mobileNumber ?? "",
      loginTime: new Date() ?? Date.now(),
      ipAddress: ipAddress ?? req.ip,
      userAgent: req.headers["user-agent"] ?? "",
      deviceLocation: deviceLocation ?? "",
      deviceName: deviceName ?? "",
      location: {
        lat: lat ?? "",
        long: long ?? "",
        pincode: pincode ?? "",
      },
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
        token,
        ownerPhoto: user.ownerPhoto,
        isKycVerified: user.isKycVerified,
        isVideoKyc: user.isVideoKyc,
        address: user.address,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Error in loginController:", error);
    return res.status(500).json({ message: "please try again later" });
  }
};

const getLoginHistory = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", role = "", date = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const loginUser = req.user;
    const skip = (page - 1) * limit;
    let loginFilter = {}; // Final filter

    if (loginUser.role === "Admin") {
      // No filter → Admin sees all logs
    } else if (loginUser.role === "Distributor") {
      // Distributor → its own retailers + self
      const retailers = await userModel.find(
        { parendistributorIdtId: loginUser.id },
        "_id"
      );

      const retailerIds = retailers.map((r) => r._id);

      loginFilter.userId = { $in: [...retailerIds, loginUser.id] };
    } else {
      // Retailer / Normal User
      loginFilter.userId = loginUser.id;
    }
    // ---------------------------------------------
    // 1️⃣ USER SEARCH BY NAME OR MOBILE
    // ---------------------------------------------
    let matchedUserIds = [];

    if (search.trim() !== "" || role !== "") {
      const regex = new RegExp(search.trim(), "i");

      const userFilter = {};

      if (search.trim() !== "") {
        userFilter.$or = [
          { name: regex },
          { mobile: regex },
          { UserId: regex },
        ];
      }

      if (role !== "") userFilter.role = role;

      const matchedUsers = await userModel.find(userFilter).select("_id");
      matchedUserIds = matchedUsers.map((u) => u._id);
    }

    // ---------------------------------------------
    // 2️⃣ LOGIN HISTORY SEARCH FIELDS
    // ---------------------------------------------
    const regex = new RegExp(search.trim(), "i");

    const loginSearchConditions = [];

    if (search.trim() !== "") {
      loginSearchConditions.push(
        { mobileNumber: regex },
        { ipAddress: regex },
        { "location.pincode": regex }
      );
    }

    if (matchedUserIds.length > 0) {
      loginSearchConditions.push({ userId: { $in: matchedUserIds } });
    }

    if (loginSearchConditions.length > 0) {
      loginFilter.$or = loginSearchConditions;
    }

    // ---------------------------------------------
    // 3️⃣ DATE FILTER (YYYY-MM-DD)
    // ---------------------------------------------
    if (date && date !== "") {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      loginFilter.loginTime = {
        $gte: start,
        $lte: end,
      };
    }

    // ---------------------------------------------
    // 4️⃣ FETCH LOGS
    // ---------------------------------------------
    const logs = await LoginHistory.find(loginFilter)
      .populate("userId", "name mobile role UserId")
      .sort({ loginTime: -1 })
      .skip(skip)
      .limit(limit);

    // ---------------------------------------------
    // 5️⃣ COUNT TOTAL FOR PAGINATION
    // ---------------------------------------------
    const totalLogs = await LoginHistory.countDocuments(loginFilter);

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      logs,
    });
  } catch (error) {
    console.error("Error fetching login history:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const registerUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let userData = { ...req.body };

    const clientSource = userData.clientSource?.toUpperCase() || "PANEL";

    if (clientSource !== "APP") {
      delete userData.referal;
    }

    const existingUser = await User.findOne({
      $or: [{ mobileNumber: userData.mobileNumber }, { email: userData.email }],
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      if (existingUser.mobileNumber === userData.mobileNumber) {
        return res
          .status(400)
          .json({ message: "User Mobile Number already exists" });
      }
      if (existingUser.email === userData.email) {
        return res.status(400).json({ message: "User Email already exists" });
      }
    }


    let referredByUser = null;

    if (clientSource === "APP" && userData.referal) {
      referredByUser = await User.findOne({
        referralCode: userData.referal,
      }).session(session);

      if (!referredByUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: "Invalid referral code",
        });
      }
    }

    if (referredByUser) {
      userData.referredBy = referredByUser._id;
    }



    //questions
    if (userData.questions && typeof userData.questions === "string") {
      try {
        userData.questions = JSON.parse(userData.questions);
      } catch (err) {
        return res.status(400).json({ message: "Invalid questions format" });
      }
    }

    if (userData.references && typeof userData.references === "string") {
      try {
        userData.references = JSON.parse(userData.references);
      } catch (err) {
        return res.status(400).json({ message: "Invalid references format" });
      }
    }
    // apiPartner
    if (userData.apiPartner && typeof userData.apiPartner === "string") {
      try {
        userData.apiPartner = JSON.parse(userData.apiPartner);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid apiPartner data format" });
      }
    }
    // address
    if (userData.address && typeof userData.address === "string") {
      try {
        userData.address = JSON.parse(userData.address);
      } catch (err) {
        return res.status(400).json({ message: "Invalid address data format" });
      }
    }
    // retailer
    if (userData.retailer && typeof userData.retailer === "string") {
      try {
        userData.retailer = JSON.parse(userData.retailer);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid retailer data format" });
      }
    }
    // distributor
    if (userData.distributor && typeof userData.distributor === "string") {
      try {
        userData.distributor = JSON.parse(userData.distributor);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid distributor data format" });
      }
    }

    // ✅ Get Admin user if no distributorId provided
    if (!userData.distributorId) {
      const adminUser = await User.findOne({ role: "Admin" });
      if (adminUser) {
        userData.distributorId = adminUser._id;
      }
    }

    if (req.files?.shopPhoto) {
      userData.shopPhoto = req.files.shopPhoto.map(
        (file) => `/uploads/${file.filename}`
      );
    }

    if (req.files?.ownerPhoto) {
      userData.ownerPhoto = `/uploads/${req.files.ownerPhoto[0].filename}`;
    }

    if (req.files) {
      if (userData.role === "Retailer" && req.files.shopAddressProof) {
        userData.shopAddressProof = `/uploads/${req.files.shopAddressProof[0].filename}`;
      }

      if (userData.role === "Distributor" && req.files.officeAddressProof) {
        userData.officeAddressProof = `/uploads/${req.files.officeAddressProof[0].filename}`;
      }
      if (userData.role === "Api Partner" && req.files.directorKycFiles) {
        userData.directorKycFiles = req.files.directorKycFiles.map(
          (file) => `/uploads/${file.filename}`
        );
      }
      if (userData.role === "Api Partner" && req.files.boardResolution) {
        userData.boardResolution = `/uploads/${req.files.boardResolution[0].filename}`;
      }
      if (req.files.aadhaarFront) {
        userData.aadhaarFront = `/uploads/${req.files.aadhaarFront[0].filename}`;
      }

      if (req.files.aadhaarBack) {
        userData.aadhaarBack = `/uploads/${req.files.aadhaarBack[0].filename}`;
      }

      if (req.files.panCard) {
        userData.panCard = `/uploads/${req.files.panCard[0].filename}`;
      }

      if (req.files.bankDocument) {
        userData.bankDocument = `/uploads/${req.files.bankDocument[0].filename}`;
      }
    }

    // ✅ Create user
    userData.UserId = await CounterModal.getNextUserId();
    const NewUser = new User(userData);
    await NewUser.save({ session });

    if (referredByUser) {

      const updatedReferrer = await User.findByIdAndUpdate(
        referredByUser._id,
        {
          $inc: {
            eWallet: 50,
            referralCount: 1,
            referralEarnings: 50,
          },
        },
        { session, new: true }
      );

      const updatedNewUser = await User.findByIdAndUpdate(
        NewUser._id,
        {
          $inc: {
            eWallet: 20,
          },
        },
        { session, new: true }
      );


      await Transaction.create([{
        user_id: updatedReferrer._id,
        transaction_type: "credit",
        type2: "Refer & Earn",
        amount: 50,
        totalCredit: 50,
        balance_after: updatedReferrer.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: `EARN${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        description: "Referral reward",
        status: "Success"
      }], { session });

      await Transaction.create([{
        user_id: updatedNewUser._id,
        transaction_type: "credit",
        type2: "Refer & Earn",
        amount: 20,
        totalCredit: 20,
        balance_after: updatedNewUser.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: `EARN${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        description: "Referral reward",
        status: "Success"
      }], { session });


    }
    await session.commitTransaction();
    session.endSession();

    // ✅ Generate JWT
    const token = generateJwtToken(
      NewUser._id,
      NewUser.role,
      NewUser.mobileNumber
    );

    // ✅ Send lead to external API
    // try {
    //   await axios.post(
    //     "https://cms.sevenunique.com/apis/leads/set-leads.php",
    //     {
    //       website_id: 6,
    //       name: NewUser.name,
    //       mobile_number: NewUser.mobileNumber,
    //       email: NewUser.email,
    //       address: NewUser.address,
    //       client_type: NewUser.role,
    //       notes: "Lead from FinUnique small private limited",
    //     },
    //     {
    //       headers: {
    //         "Content-Type": "application/json",
    //         Authorization: "Bearer jibhfiugh84t3324fefei#*fef",
    //       },
    //     }
    //   );
    // } catch (leadError) {
    //   console.error(
    //     "Error sending lead data:",
    //     leadError.response ? leadError.response.data : leadError.message
    //   );
    // }

    return res.status(200).json({
      message: "Registration successful",
      newUser: NewUser,
      token,
    });
  } catch (error) {
    console.log("eeeeeeeeeeeeeee", error);
    await session.abortTransaction();
    session.endSession();
    console.error("Error in registerUser controller:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

const updateProfileController = async (req, res) => {
  try {
    const {
      name,
      email,
      mpin,
      bankDetails,
      address,
      pinCode,
      role,
      agreement,
      isKycVerified,
      isVideoKyc,
      isSpecial,
      shopType,
      shopName,
      userId,
    } = req.body;
    console.log(req.body);

    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (mpin) user.mpin = mpin;
    if (bankDetails) user.bankDetails = bankDetails;
    if (address) {
      user.address = {
        fullAddress: address.fullAddress,
        block: address.block,
        city: address.city,
        state: address.state,
        country: address.country || "India",
      };
    }
    if (pinCode) user.pinCode = pinCode;
    if (role) user.role = role;
    if (agreement !== undefined) user.agreement = agreement;
    if (isKycVerified !== undefined) user.isKycVerified = isKycVerified;
    if (isVideoKyc !== undefined) user.isVideoKyc = isVideoKyc;
    if (isSpecial !== undefined) user.isSpecial = isSpecial;
    if (shopType) user.shopType = shopType;
    if (shopName) user.shopName = shopName;

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error in updateProfileController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getUserController = async (req, res) => {
  try {
    let userDoc = await User.findById(
      req.user.id,
      "-mpin -commissionPackage -meta -password"
    )
      .populate("role")
      .populate({
        path: "plan.planId",
        populate: { path: "services", model: "Service" },
      })
      .populate({
        path: "distributorId",
        select: "id name",
      });

    if (!userDoc) {
      return res.status(404).json({ message: "No user found" });
    }

    // ✅ Call method safely
    const effectivePermissions = await userDoc.getEffectivePermissions();

    // ✅ Convert to object only after calling method
    let user = userDoc.toObject();

    // Filter plan.amount
    if (user.plan?.planId?.amount && user.plan?.planType) {
      user.plan.planId.amount = user.plan.planId.amount.filter(
        (a) => a.type === user.plan.planType
      );
    }

    const userMeta =
      (await userMetaModel
        .findOne({ userId: req.user.id })
        .populate("services.serviceId")) || {};

    let remainingDays = null;
    if (user.plan?.startDate && user.plan?.endDate) {
      const today = new Date();
      const endDate = new Date(user.plan.endDate);
      const diffTime = endDate.getTime() - today.getTime();
      remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    return res
      .status(200)
      .json({ user, userMeta, effectivePermissions, remainingDays });
  } catch (error) {
    console.error("Error in getUserController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getUserId = async (req, res) => {
  try {
    let userDoc = await User.findById(
      req.params.id,
      "-mpin -commissionPackage -meta -password"
    )
      .populate("role")
      .populate({
        path: "plan.planId",
        populate: { path: "services", model: "Service" },
      })
      .populate({
        path: "distributorId",
        select: "id name",
      })
      .populate("extraPermissions");

    if (!userDoc) {
      return res.status(404).json({ message: "No user found" });
    }

    // ✅ Call method safely
    const effectivePermissions = await userDoc.getEffectivePermissions();

    // ✅ Convert to object only after calling method
    let user = userDoc.toObject();

    // Filter plan.amount
    if (user.plan?.planId?.amount && user.plan?.planType) {
      user.plan.planId.amount = user.plan.planId.amount.filter(
        (a) => a.type === user.plan.planType
      );
    }

    const userMeta =
      (await userMetaModel
        .findOne({ userId: req.user.id })
        .populate("services.serviceId")) || {};

    return res.status(200).json({ user, userMeta, effectivePermissions });
  } catch (error) {
    console.error("Error in getUserController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getUsersWithFilters = async (req, res) => {
  try {
    const {
      keyword,
      role,
      from,
      to,
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
      exportType = "false",
      status,
      isKycVerified,
      inactiveOrUnverified,
      state,
      district,
      distributorId,
    } = req.query;

    const andConditions = [];
    if (state) {
      andConditions.push({
        "address.state": { $regex: new RegExp(`^${state}$`, "i") },
      });
    }

    if (district) {
      andConditions.push({
        $or: [
          { "address.city": { $regex: new RegExp(`^${district}$`, "i") } },
          { "address.block": { $regex: new RegExp(`^${district}$`, "i") } },
          { "address.dist": { $regex: new RegExp(`^${district}$`, "i") } },
        ],
      });
    }

    if (distributorId) {
      andConditions.push({ distributorId: distributorId });
    }
    if (keyword) {
      andConditions.push({
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { email: { $regex: keyword, $options: "i" } },
          { mobileNumber: { $regex: keyword, $options: "i" } },
          { UserId: { $regex: keyword, $options: "i" } },
        ],
      });
    }

    if (inactiveOrUnverified === true || inactiveOrUnverified === "true") {
      andConditions.push({
        $or: [{ status: false }, { isKycVerified: false }],
      });
    } else {
      if (status) andConditions.push({ status: status === "true" });
      if (isKycVerified)
        andConditions.push({ isKycVerified: isKycVerified === "true" });
    }

    // 🔹 Role filter
    if (role) {
      andConditions.push({ role });
    }

    // 🔹 Date range filter
    if (from || to) {
      const dateFilter = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      andConditions.push({ createdAt: dateFilter });
    }

    // 🔹 Distributor restriction
    const loggedInUser = req.user;
    if (loggedInUser.role === "Distributor") {
      andConditions.push({ distributorId: loggedInUser.id });
    }

    // Final filter
    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const sort = {};
    sort[sortBy] = order === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    let users = await User.find(filter)
      .select("-mpin")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    // .skip(exportType !== "false" ? 0 : skip)
    // .limit(
    //   exportType !== "false" ? Number.MAX_SAFE_INTEGER : parseInt(limit)
    // );

    // ✅ Effective Permissions add karo
    users = await Promise.all(
      users.map(async (u) => {
        const effectivePermissions = await u.getEffectivePermissions();
        const userObj = u.toObject();

        delete userObj.extraPermissions;
        delete userObj.restrictedPermissions;
        delete userObj.rolePermissions;

        return {
          ...userObj,
          effectivePermissions,
        };
      })
    );
    // console.log(users);

    let fields = [];

    if (inactiveOrUnverified) {
      fields = [
        "UserId",
        "name",
        "email",
        "role",
        "mobileNumber",
        "status",
        "isKycVerified",
        "registrationProgress",
      ];
    } else {
      fields = [
        "UserId",
        "name",
        "email",
        "role",
        "mobileNumber",
        "status",
        "isKycVerified",
        "eWallet",
        "createdAt",
      ];
    }

    // ========== EXPORT HANDLING ==========
    if (exportType === "csv") {
      const csv = parse(users, { fields });
      res.header("Content-Type", "text/csv");
      res.attachment("users.csv");
      return res.send(csv);
    }

    if (exportType === "excel") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Users");

      worksheet.columns = fields.map((f) => ({ header: f, key: f }));
      users.forEach((u) => worksheet.addRow(u));

      res.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.attachment("users.xlsx");

      await workbook.xlsx.write(res);
      return res.end();
    }

    if (exportType === "pdf") {
      const doc = new PDFDocument({ margin: 30, size: "A4" });
      res.header("Content-Type", "application/pdf");
      res.attachment("users.pdf");
      doc.pipe(res);

      doc.fontSize(18).text("Users Report", { align: "center" });
      doc.moveDown();

      // 🔹 Agar inactive/unverified users ka export hai
      let headers, rows;
      if (inactiveOrUnverified === true || inactiveOrUnverified === "true") {
        headers = [
          "#",
          "UserId",
          "Name",
          "Email",
          "Role",
          "Mobile Number",
          "Status",
          "KYC Status",
          "registrationProgress",
          "Created At",
        ];
        rows = users.map((u, i) => [
          i + 1,
          u.UserId,
          u.name,
          u.email,
          u.role,
          u.mobileNumber,
          u.status,
          u.isKycVerified ? "Verified" : "Not Verified",
          u.registrationProgress
            ? `Step ${u.registrationProgress.currentStep}`
            : "N/A",

          u.createdAt ? new Date(u.createdAt).toLocaleString() : "-",
        ]);
      } else {
        // 🔹 Normal export with more fields
        headers = [
          "#",
          "UserId",
          "Name",
          "Email",
          "Role",
          "Mobile Number",
          "Status",
          "KYC Status",
          "eWallet",
          "Created At",
          "Updated At",
        ];
        rows = users.map((u, i) => [
          i + 1,
          u.UserId,
          u.name,
          u.email,
          u.role,
          u.mobileNumber,
          u.status,
          u.isKycVerified ? "Verified" : "Not Verified",
          u.eWallet,
          u.createdAt ? new Date(u.createdAt).toLocaleString() : "-",
          u.updatedAt ? new Date(u.updatedAt).toLocaleString() : "-",
        ]);
      }

      const table = { headers, rows };

      await doc.table(table, { width: 500 });
      doc.end();
      return;
    }

    if (exportType === "json") {
      res.header("Content-Type", "application/json");
      res.attachment("users.json");
      return res.json(users);
    }

    // Normal API response (pagination ke sath)
    const totalUsers = await User.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
      },
    });
  } catch (error) {
    console.error("Error in getUsersWithFilters:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.params.id;

    if (!userId || status === undefined) {
      return res
        .status(400)
        .json({ message: "User ID and status are required" });
    }
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.status = status;
    await user.save();
    return res.status(200).json({
      message: "User status updated successfully",
      user: {
        id: user._id,
        name: user.name,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Error in updateUserStatus:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;

    const {
      role,
      status,
      isAccountActive,
      commissionPackage,
      cappingMoney,
      eWallet,
      meta,
      password,
      mpin,
      outletId,
      callbackUrl,
    } = req.body;


    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    let user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (role) user.role = role;
    if (status !== undefined) user.status = status;
    if (commissionPackage) user.commissionPackage = commissionPackage;
    if (isAccountActive !== undefined) user.isAccountActive = isAccountActive;
    if (cappingMoney !== undefined) user.cappingMoney = cappingMoney;
    if (eWallet !== undefined) user.eWallet = eWallet;
    if (meta) user.meta = meta;
    if (password) user.password = password;
    if (mpin) user.mpin = mpin;
    if (outletId) user.outletId = outletId;
    if (callbackUrl || callbackUrl == "") user.callbackUrl = callbackUrl;

    await user.save();
    return res.status(200).json({
      message: "User details updated successfully",
    });
  } catch (error) {
    console.error("Error in updateUserDetails:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateCredential = async (req, res) => {
  try {
    const { mobileNumber, type, newValue, otp, userId } = req.body;

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({ mobileNumber });
    }
    if (!user) return res.status(404).json({ message: "User not found" });

    if (type === "password") {
      user.password = newValue;
    } else if (type === "mpin") {
      user.mpin = newValue;
    } else {
      return res.status(400).json({ message: "Invalid type" });
    }

    await user.save();

    await OTP.deleteMany({ mobileNumber });

    res.json({ success: true, message: `${type} updated successfully` });
  } catch (err) {
    console.error("Error updating credential:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const Transaction = require("../models/transactionModel.js");
const servicesModal = require("../models/servicesModal.js");



const getDashboardStats = async (req, res, next) => {
  try {
    const userRole = req.query.userRole;
    const user = req.user;
    // console.log("Dashboard user:", user);
    const role = user.role;

    let stats = {
      userInfo: {
        name: user.name,
        role: user.role,
        wallet: user.eWallet,
      },
    };
    const { startUTC, endUTC } = getISTDayRange();

    const matchToday = {
      createdAt: { $gte: startUTC, $lte: endUTC }
    };

    const matchUser = (field = "userId") => ({ [field]: user._id });
    const matchTodayUser = (field = "userId") => ({
      [field]: user.id,
      createdAt: { $gte: startUTC, $lte: endUTC }
    });
    console.log("matchTodayUser", matchTodayUser);


    let todayEarning = 0;
    let todayCharges = 0;

    if (["Admin", "Distributor", "Retailer"].includes(role)) {
      // Today Earnings
      const earningResult = await CommissionTransaction.aggregate([
        { $unwind: "$roles" },
        {
          $match: {
            "roles.role": role,
            "roles.userId": new mongoose.Types.ObjectId(user.id),
            status: "Success",
            createdAt: { $gte: startUTC, $lte: endUTC },
          },
        },
        {
          $group: {
            _id: null,
            todayEarning: { $sum: "$roles.commission" },
          },
        },
      ]);

      todayEarning = earningResult[0]?.todayEarning || 0;

      // Today Charges
      const chargeResult = await CommissionTransaction.aggregate([
        { $unwind: "$roles" },
        {
          $match: {
            "roles.role": role,
            "roles.userId": new mongoose.Types.ObjectId(user.id),
            status: "Success",
            createdAt: { $gte: startUTC, $lte: endUTC },
          },
        },
        {
          $group: {
            _id: null,
            todayCharges: { $sum: "$roles.chargeShare" },
          },
        },
      ]);

      todayCharges = chargeResult[0]?.todayCharges || 0;
    }

    // 🔹 Last 10 transactions
    let last5Txns = [];
    if (role === "Admin") {
      last5Txns = await Transaction.find({})
        .sort({ createdAt: -1 })
        .limit(7)
        .lean();
    } else if (role === "Distributor") {
      const retailers = await User.find({ distributorId: user.id }, { _id: 1 });
      const retailerIds = retailers.map((r) => r._id);

      last5Txns = await Transaction.find({ user_id: { $in: retailerIds } })
        .sort({ createdAt: -1 })
        .limit(7)
        .lean();
    } else if (role === "Retailer") {
      last5Txns = await Transaction.find({ user_id: user.id })
        .sort({ createdAt: -1 })
        .limit(7)
        .lean();
    }

    let query = {};
    if (role === "Admin") {
      query.role = userRole;
    } else if (role === "Distributor") {
      if (role === "Distributor") {
        query = { distributorId: req.user.id };
      } else {
        return res.status(400).json({ status: false, message: "Invalid role" });
      }
    }
    console.log(query);

    const users = await User.find(query).select(
      "_id name email eWallet phone UserId"
    );
    // 🔹 Admin Dashboard
    if (role === "Admin") {
      const [
        totalUsers,
        totalRetailers,
        totalDistributors,
        totalAepsTxns,
        totalDmtTxns,
        totalBbpsTxns,

        totalPayouts,
        totalPayIn,

        totalWalletBalance,
        todayPayins,
        todayPayouts,
        todayTxns,
        failedTxns,
        successTxns,
        activeUsers,
        activeServices,
        activeRetailers,
        activeDistributors,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "Retailer" }),
        User.countDocuments({ role: "Distributor" }),
        AEPSWithdrawal.countDocuments(),
        DmtReport.countDocuments(),
        BbpsHistory.countDocuments(),
        PayOut.aggregate([
          { $match: { createdAt: { $gte: startUTC, $lte: endUTC }, status: "Success" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        PayIn.aggregate([
          { $match: { createdAt: { $gte: startUTC, $lte: endUTC }, status: "Success" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        User.aggregate([
          { $group: { _id: null, total: { $sum: "$eWallet" } } },
        ]),
        PayIn.countDocuments(matchToday),
        PayOut.countDocuments(matchToday),
        Transaction.aggregate([
          { $match: { createdAt: { $gte: startUTC, $lte: endUTC }, status: "Success" } },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                  },
                },
              ],
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                  },
                },
              ],
            },
          },
        ]),
        Transaction.countDocuments({ ...matchToday, status: "Failed" }),
        Transaction.countDocuments({ ...matchToday, status: "Success" }),
        User.countDocuments({ status: true, isKycVerified: true }),
        servicesModal.countDocuments({ isActive: true }),
        User.countDocuments({
          role: "Retailer",
          status: true,
          isKycVerified: true,
        }),
        User.countDocuments({
          role: "Distributor",
          status: true,
          isKycVerified: true,
        }),
      ]);

      const successRate =
        successTxns + failedTxns > 0
          ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
          : "0.00";

      stats.common = {
        users,
        todayEarning,
        todayCharges,
        totalUsers,
        totalRetailers,
        totalDistributors,
        activeRetailers,
        activeDistributors,
        totalAEPS: totalAepsTxns,
        totalDMT: totalDmtTxns,
        totalBBPS: totalBbpsTxns,
        totalPayoutAmount: totalPayouts[0]?.total || 0,
        totalPayInAmount: totalPayIn[0]?.total || 0,
        totalWalletBalance: totalWalletBalance[0]?.total || 0,
        activeUsers,
        activeServices,
        today: {
          payinCount: todayPayins,
          payoutCount: todayPayouts,
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
          failedTransactions: failedTxns,
        },
        recentTransactions: last5Txns,
      };
    }

    // 🔹 Distributor Dashboard
    else if (role === "Distributor") {
      const [
        myRetailers,
        aepsTxns,
        dmtTxns,
        totalWallet,
        todayPayin,
        todayPayout,
        todayTxns,
        failedTxns,
        successTxns,
        activeRetailers,
      ] = await Promise.all([
        User.countDocuments({ distributorId: user.id, role: "Retailer" }),
        AEPSWithdrawal.countDocuments({ userId: user.id }),
        DmtReport.countDocuments({ user_id: user.id }),
        User.aggregate([
          { $match: { distributorId: user.id } },
          { $group: { _id: null, total: { $sum: "$eWallet" } } },
        ]),
        PayIn.countDocuments(matchTodayUser()),
        PayOut.countDocuments(matchTodayUser()),
        Transaction.aggregate([
          { $match: { createdAt: { $gte: startUTC, $lte: endUTC }, distributorId: new mongoose.Types.ObjectId(user.id), status: "Success" } },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                  },
                },
              ],
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                  },
                },
              ],
            },
          },
        ]),
        Transaction.countDocuments({
          ...matchTodayUser("user_id"),
          status: "Failed",
        }),
        Transaction.countDocuments({
          ...matchTodayUser("user_id"),
          status: "Success",
        }),
        User.countDocuments({
          distributorId: user.id,
          role: "Retailer",
          status: true,
        }),
      ]);

      const successRate =
        successTxns + failedTxns > 0
          ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
          : "0.00";

      stats.common = {
        users,
        todayEarning,
        todayCharges,
        totalUsers: 0, // distributors ko total users nahi dikhana
        totalRetailers: myRetailers,
        totalDistributors: 0,
        activeRetailers,
        activeDistributors: 0,
        totalRetailerWallet: totalWallet[0]?.total || 0,
        totalAEPS: aepsTxns,
        totalDMT: dmtTxns,
        today: {
          payinCount: todayPayin,
          payoutCount: todayPayout,
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
          failedTransactions: failedTxns,
        },
        recentTransactions: last5Txns,
      };
    }

    // 🔹 Retailer/User Dashboard
    else if (["Retailer", "User"].includes(role)) {
      const [
        aeps,
        dmt,
        bbps,
        todayPayin,
        todayPayout,
        todayTxns,
        failedTxns,
        successTxns,
      ] = await Promise.all([
        AEPSWithdrawal.countDocuments({ userId: user.id }),
        DmtReport.countDocuments({ user_id: user.id }),
        BbpsHistory.countDocuments({ userId: user.id }),
        PayIn.countDocuments(matchTodayUser()),
        PayOut.countDocuments(matchTodayUser()),
        Transaction.aggregate([
          { $match:{ createdAt: { $gte: startUTC, $lte: endUTC }, user_id: new mongoose.Types.ObjectId(user.id), status: "Success" } },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                  },
                },
              ],
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                  },
                },
              ],
            },
          },
        ]),
        Transaction.countDocuments({
          ...matchTodayUser("user_id"),
          status: "Failed",
        }),
        Transaction.countDocuments({
          ...matchTodayUser("user_id"),
          status: "Success",
        }),
      ]);

      const successRate =
        successTxns + failedTxns > 0
          ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
          : "0.00";

      stats.common = {
        todayEarning,
        todayCharges,
        totalUsers: 0,
        totalRetailers: 0,
        totalDistributors: 0,
        activeRetailers: 0,
        activeDistributors: 0,
        totalAEPS: aeps,
        totalDMT: dmt,
        totalBBPS: bbps,
        today: {
          payinCount: todayPayin,
          payoutCount: todayPayout,
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
          failedTransactions: failedTxns,
        },
        recentTransactions: last5Txns,
      };
    }

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    return next(err);
  }
};

//get service usege

const getServiceUsage = async (req, res) => {
  try {
    const user = req.user;
    let matchQuery = { status: "Success" };

    if (user.role === "Admin") {
      // ✅ pura system
      matchQuery = { status: "Success" };
    } else if (user.role === "Distributor") {
      const retailers = await User.find(
        { distributorId: user.id, role: "Retailer" },
        "_id"
      );
      matchQuery = {
        status: "Success",
        "roles.userId": { $in: retailers.map((r) => r._id) },
      };
    } else if (user.role === "Retailer") {
      // ✅ sirf apna
      matchQuery = {
        status: "Success",
        "roles.userId": new mongoose.Types.ObjectId(user.id),
      };
    }

    const serviceUsage = await CommissionTransaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$service",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // service populate karo
    const populatedUsage = await servicesModal.populate(serviceUsage, {
      path: "_id",
      select: "name",
    });

    const formatted = populatedUsage.map((item) => ({
      name: item._id?.name || "Unknown",
      count: item.count,
    }));

    res.json({
      success: true,
      role: user.role,
      total: formatted.reduce((sum, i) => sum + i.count, 0),
      services: formatted,
    });
  } catch (err) {
    console.error("Error in getServiceUsage:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//get payin and payout report

const getPayInPayOutReport = async (req, res) => {
  try {
    const user = req.user;
    let matchQuery = {};

    // 🔹 Role check
    if (user.role === "Admin") {
      matchQuery = {}; // pura system
    } else if (user.role === "Distributor") {
      const retailers = await User.find(
        { distributorId: user.id, role: "Retailer" },
        "_id"
      );

      matchQuery = { userId: { $in: retailers.map((r) => r._id) } };
    } else if (user.role === "Retailer") {
      matchQuery = { userId: new mongoose.Types.ObjectId(user.id) };
    }

    const payin = await payInModel.aggregate([
      { $match: { ...matchQuery, status: "Success" } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const payout = await payOutModel.aggregate([
      { $match: { ...matchQuery, status: "Success" } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      role: user.role,
      payin,
      payout,
    });
  } catch (error) {
    console.error("Error fetching PayIn-PayOut:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const CounterModal = require("../models/Counter.modal.js");
const CommissionTransaction = require("../models/CommissionTransaction.js");
const payOutModel = require("../models/payOutModel.js");
const payInModel = require("../models/payInModel.js");
const otpModel = require("../models/otpModel.js");
const LoginHistory = require("../models/LoginHistory.js");
const userModel = require("../models/userModel.js");
const { generateToken } = require("./kycController.js");


// const updateUserPermissions = async (req, res) => {
//   try {
//     let { extraPermissions = [], restrictedPermissions = [] } = req.body;

//     const Permission = mongoose.model("Permission");

//     const resolveIdsFromKeys = async (items) => {
//       // Agar item string aur ObjectId valid nahi hai, assume it's a key
//       const docs = await Permission.find({
//         $or: [
//           { _id: { $in: items.filter(mongoose.Types.ObjectId.isValid) } },
//           { key: { $in: items } },
//         ],
//       });

//       return docs.map((p) => p._id.toString());
//     };

//     extraPermissions = await resolveIdsFromKeys(extraPermissions);
//     restrictedPermissions = await resolveIdsFromKeys(restrictedPermissions);

//     const user = await User.findByIdAndUpdate(
//       req.params.id,
//       { extraPermissions, restrictedPermissions },
//       { new: true }
//     );

//     if (!user) return res.status(404).json({ message: "User not found" });

//     res.json({
//       ...user.toObject(),
//       effectivePermissions: await user.getEffectivePermissions(),
//     });
//   } catch (err) {
//     console.error("Error in updateUserPermissions:", err);
//     return res.status(500).json({ message: err.message });
//   }
// };

// GET /users/:id/permissions

const updateUserPermissions = async (req, res) => {
  try {
    let { extraPermissions = [], restrictedPermissions = [] } = req.body;

    // 👉 Only keep valid ObjectIds
    extraPermissions = extraPermissions.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    restrictedPermissions = restrictedPermissions.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { extraPermissions, restrictedPermissions },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      success: true,
      ...user.toObject(),
      effectivePermissions: await user.getEffectivePermissions(),
      totalRolePermissions: user.rolePermissions?.permissions?.length || 0,
      totalExtraPermissions: extraPermissions.length,
      totalRestrictedPermissions: restrictedPermissions.length,
    });
  } catch (err) {
    console.error("Error in updateUserPermissions:", err);
    return res.status(500).json({ message: err.message });
  }
};

const getUserPermissions = async (req, res) => {
  try {
    // 1️⃣ DB se user nikal lo
    const user = await User.findById(req.params.id)
      .populate("extraPermissions")
      .populate("restrictedPermissions");

    if (!user) return res.status(404).json({ message: "User not found" });

    // 2️⃣ Response me teen cheeze do:
    res.json({
      role: user.role, // user ka role
      extraPermissions: user.extraPermissions, // jo manually SuperAdmin ne add kiye
      restrictedPermissions: user.restrictedPermissions, // jo remove kiye
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
    comssole.log("Error in getUserPermissions:", error);
  }
};

// update proge
const updateProgress = async (req, res) => {
  try {
    const { userId, step, stepTitle } = req.body;

    if (userId) {
      const user = await User.findById(userId);

      if (user) {
        user.registrationProgress = {
          currentStep: step,
          currentStepTitle: stepTitle,
          status: step === 7 ? "completed" : "incomplete",
          lastUpdated: new Date(),
        };
        await user.save();
      } else {
        console.log("User not found, skipping progress update");
      }
    } else {
      console.log("No userId provided, skipping progress update");
    }
    return res.json({
      success: true,
      message: "Progress update flow executed (safe mode)",
    });
  } catch (err) {
    console.error("updateProgress error:", err);
    return res.json({
      success: true,
      message: "Progress update skipped due to error",
    });
  }
};

const updateUserDocs = async (req, res) => {
  try {
    const role = req.user.role;

    // 🛑 Only admin / superAdmin can update
    if (role !== "Admin" && role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can update documents",
      });
    }

    const userId = req.params.id;

    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const files = req.files || {};

    // helper to return `/uploads/filename`
    const getFile = (fieldName, oldValue) => {
      return files[fieldName]
        ? `/uploads/${files[fieldName][0].filename}`
        : oldValue;
    };

    // SHOP PHOTO ARRAY (MULTIPLE APPEND)
    let newShopPhotos = user.shopPhoto || [];
    if (files.shopPhoto) {
      const uploadedShopPhotos = files.shopPhoto.map(
        (f) => `/uploads/${f.filename}`
      );
      newShopPhotos = [...newShopPhotos, ...uploadedShopPhotos];
    }

    // DIRECTOR KYC FILES (MULTIPLE)
    let newDirectorKyc = user.directorKycFiles || [];
    if (files.directorKycFiles) {
      const uploadedKyc = files.directorKycFiles.map(
        (f) => `/uploads/${f.filename}`
      );
      newDirectorKyc = [...newDirectorKyc, ...uploadedKyc];
    }

    const updateData = {
      aadhaarFront: getFile("aadhaarFront", user.aadhaarFront),
      aadhaarBack: getFile("aadhaarBack", user.aadhaarBack),
      panCard: getFile("panCard", user.panCard),
      bankDocument: getFile("bankDocument", user.bankDocument),
      ownerPhoto: getFile("ownerPhoto", user.ownerPhoto),
      shopAddressProof: getFile("shopAddressProof", user.shopAddressProof),
      officeAddressProof: getFile(
        "officeAddressProof",
        user.officeAddressProof
      ),
      boardResolution: getFile("boardResolution", user.boardResolution),

      // arrays
      shopPhoto: newShopPhotos,
      directorKycFiles: newDirectorKyc,
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

    res.json({
      success: true,
      message: "Documents updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Document update error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Try again later",
    });
  }
};

module.exports = {
  sendOtpController,
  verifyOTPController,
  registerUser,
  loginController,
  updateProfileController,
  getUserController,
  getUsersWithFilters,
  updateUserStatus,
  updateUserDetails,
  updateCredential,
  getDashboardStats,
  updateUserPermissions,
  getUserPermissions,
  getServiceUsage,
  getPayInPayOutReport,
  getUserId,
  updateProgress,
  getLoginHistory,
  verifyEmail7Unique,
  updateUserDocs,
};
