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
const PermissionByRole = require("../models/PermissionByRole.js");
const CounterModal = require("../models/Counter.modal.js");
const CommissionTransaction = require("../models/CommissionTransaction.js");
const payOutModel = require("../models/payOutModel.js");
const payInModel = require("../models/payInModel.js");
const otpModel = require("../models/otpModel.js");
const LoginHistory = require("../models/LoginHistory.js");
const userModel = require("../models/userModel.js");
const { generateToken } = require("./kycController.js");
const scratchCouponModel = require("../models/scratchCoupon.model.js");
const Transaction = require("../models/transactionModel.js");
const servicesModal = require("../models/servicesModal.js");
const userModalActionModal = require("../models/userModalAction.modal.js");
const redis = require("../middleware/redis.js");
const { invalidateUsersCache, invalidateProfileCache, invalidateUserPermissionsCache, invalidateAllDashboardCache, invalidateLoginHistoryCache, checkLoginAttempts, resetLoginAttempts, incrementLoginAttempts, checkOtpLimit, incrementOtpCount } = require("../middleware/redisValidation.js");

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
    // const check = await verifyEmail7Unique(user.email || "");
    // if (!check.valid) {
    //   console.log("⚠ Skipping login email. Invalid email:", user.email);
    //   return;
    // }
    // console.log("✅ Email verified by 7Unique:", check);
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
      // console.log("✅ Login email sent", res.data);
    } catch (error) {
      console.error("❌ Error sending login email:", error.message);
    }

    // console.log("✅ Login email sent to:", user.email);
  } catch (error) {
    console.error("❌ Error sending login email:", error.message);
  }
};

const logoutController = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "FORCE_LOGOUT",
        message: "Invalid session",
      });
    }

    if (redis) {
      try {
        await redis.del(`USER_SESSION:${userId}`);
      } catch (err) {
        console.error("REDIS LOGOUT FAILED:", err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Logout failed. Please try again.",
    });
  }
};


const sendOtpController = async (req, res) => {
  try {
    const { mobileNumber, isRegistered, ifLogin, type } = req.body;

    // ✅ Validation
    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }
    let otpKey = null
    if (redis) {
      otpKey = `otp:send:mobile:${mobileNumber}`;
      const allowed = await checkOtpLimit(otpKey);
      if (!allowed) {
        return res.status(429).json({
          success: false,
          message: "Too many OTP requests. Try again after 10 minutes.",
        });
      }
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
    const smsResult = await sendOtp(mobileNumber, otp, type);
    if (redis && smsResult.success) {
      await incrementOtpCount(otpKey);
    }

    if (smsResult.success) {
      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        data: { mobileNumber },
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
    if (redis && verificationResult.success) {
      await redis.del(`otp:send:mobile:${mobileNumber}`);
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

// const loginController = async (req, res) => {
//   try {
//     const {
//       mobileNumber,
//       password,
//       otp,
//       lat,
//       long,
//       pincode,
//       ipAddress,
//       deviceLocation,
//     } = req.body;
//     if (!mobileNumber) {
//       return res.status(400).json({ message: "Mobile number is required" });
//     }
//     const ip = req.ip;

//     const ipKey = `login:attempt:ip:${ip}`;
//     if (redis) {
//       const ipAllowed = await checkLoginAttempts(ipKey);
//       if (!ipAllowed) {
//         return res.status(403).json({
//           success: false,
//           message: "Too many attempts. Try after 10 min.",
//         });
//       }
//     }

//     const user = await User.findOne({ mobileNumber }).select("_id role mobileNumber name email status isKycVerified clientSource forceLogout address isVideoKyc ownerPhoto password")
//     if (!user) {
//       await incrementLoginAttempts(ipKey);
//       return res.status(404).json({ message: "No user found" });
//     }
//     let userKey = null;
//     if (user) {
//       userKey = `login:attempt:user:${user._id}`;
//     }
//     const userAllowed = await checkLoginAttempts(userKey);
//     if (!userAllowed) {
//       return res.status(403).json({
//         success: false,
//         message: "Too many failed attempts. Try after 10 min.",
//       });
//     }


//     if (user.status === false) {
//       return res
//         .status(403)
//         .json({ message: "Your account is blocked. Please contact support." });
//     }
//     if (user.isKycVerified === false) {
//       return res
//         .status(403)
//         .json({ message: "Your KYC is Pending Please register now and done your KYC first" });
//     }
//     if (user.role === "User" && user.clientSource === "PANEL") {
//       return res.status(403).json({
//         message:
//           "This panel is not for users; Only retailers and distributors can access it.",
//       });
//     }

//     // ✅ OTP login
//     if (otp) {
//       const verificationResult = await verifyOtp(mobileNumber, otp);
//       if (!verificationResult.success) {
//         await incrementLoginAttempts(ipKey);
//         if (userKey) {
//           await incrementLoginAttempts(userKey);
//         }
//         return res.status(400).json({ message: verificationResult.message });
//       }
//     }
//     // ✅ Password login
//     else if (password) {
//       const isMatch = await user.comparePassword(password);

//       if (!isMatch) {
//         await incrementLoginAttempts(ipKey);
//         if (userKey) {
//           await incrementLoginAttempts(userKey);
//         }
//         return res.status(400).json({ message: "Invalid password" });
//       }
//     } else {
//       return res
//         .status(400)
//         .json({ message: "Password or OTP is required to login" });
//     }
//     const token = generateJwtToken(user._id, user.role, user.mobileNumber);
//     const deviceName = getDeviceName(req.headers["user-agent"]);

//     if (user.forceLogout === true) {
//       user.forceLogout = false
//       await user.save();
//     }
//     if (redis) {
//       try {
//         const SESSION_TTL = 60 * 60 * 24;
//         await redis.multi()
//           .del(`USER_SESSION:${user._id}`)
//           .setex(`USER_SESSION:${user._id}`, SESSION_TTL, token)
//           .exec();
//       } catch (error) {
//         console.error("FAILED TO SET USER_SESSION", error);
//       }
//     }

//     // sendLoginEmail(
//     //   user,
//     //   lat,
//     //   long,
//     //   pincode,
//     //   ipAddress,
//     //   deviceLocation,
//     //   deviceName
//     // );
//     // await LoginHistory.create({
//     //   userId: user._id ?? null,
//     //   mobileNumber: user.mobileNumber ?? "",
//     //   loginTime: new Date() ?? Date.now(),
//     //   ipAddress: ipAddress ?? req.ip,
//     //   userAgent: req.headers["user-agent"] ?? "",
//     //   deviceLocation: deviceLocation ?? "",
//     //   deviceName: deviceName ?? "",
//     //   location: {
//     //     lat: lat ?? "",
//     //     long: long ?? "",
//     //     pincode: pincode ?? "",
//     //   },
//     // });
//     // await invalidateLoginHistoryCache(user._id)
//     if (userKey) {
//       await resetLoginAttempts(userKey);
//     }
//     await resetLoginAttempts(ipKey);
//     console.log(
//       {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         mobileNumber: user.mobileNumber,
//         role: user.role,
//         token,
//         ownerPhoto: user.ownerPhoto,
//         isKycVerified: user.isKycVerified,
//         isVideoKyc: user.isVideoKyc,
//         address: user.address,
//         status: user.status,
//       })
//     return res.status(200).json({
//       message: "Login successfully",
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         mobileNumber: user.mobileNumber,
//         role: user.role,
//         token,
//         ownerPhoto: user.ownerPhoto,
//         isKycVerified: user.isKycVerified,
//         isVideoKyc: user.isVideoKyc,
//         address: user.address,
//         status: user.status,
//       },
//     });
//   } catch (error) {
//     console.error("Error in loginController:", error);
//     return res.status(500).json({ message: "please try again later" });
//   }
// };


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
    const ip = req.ip;

    const ipKey = `login:attempt:ip:${ip}`;
    if (redis) {
      const ipAllowed = await checkLoginAttempts(ipKey);
      if (!ipAllowed) {
        return res.status(403).json({
          success: false,
          message: "Too many attempts. Try after 10 min.",
        });
      }
    }

    const user = await User.findOne({ mobileNumber }).select("_id role mobileNumber name email status isKycVerified clientSource forceLogout address isVideoKyc ownerPhoto password")
    if (!user) {
      await incrementLoginAttempts(ipKey);
      return res.status(404).json({ message: "No user found" });
    }
    let userKey = null;
    if (redis) {
      if (user) {
        userKey = `login:attempt:user:${user._id}`;
      }
      const userAllowed = await checkLoginAttempts(userKey);
      if (!userAllowed) {
        return res.status(403).json({
          success: false,
          message: "Too many failed attempts. Try after 10 min.",
        });
      }
    }


    if (user.status === false) {
      return res
        .status(403)
        .json({ message: "Your account is blocked. Please contact support." });
    }
    if (user.isKycVerified === false) {
      return res
        .status(403)
        .json({ message: "Your KYC is Pending Please register now and done your KYC first" });
    }
    if (user.role === "User" && user.clientSource === "PANEL") {
      return res.status(403).json({
        message:
          "This panel is not for users; Only retailers and distributors can access it.",
      });
    }

    // ✅ OTP login
    if (otp) {
      const verificationResult = await verifyOtp(mobileNumber, otp);
      if (!verificationResult.success) {
        await incrementLoginAttempts(ipKey);
        if (userKey) {
          await incrementLoginAttempts(userKey);
        }
        return res.status(400).json({ message: verificationResult.message });
      }
    }
    // ✅ Password login
    else if (password) {
      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        await incrementLoginAttempts(ipKey);
        if (userKey) {
          await incrementLoginAttempts(userKey);
        }
        return res.status(400).json({ message: "Invalid password" });
      }
    } else {
      return res
        .status(400)
        .json({ message: "Password or OTP is required to login" });
    }
    const token = generateJwtToken(user._id, user.role, user.mobileNumber);
    const deviceName = getDeviceName(req.headers["user-agent"]);

    if (user.forceLogout === true) {
      user.forceLogout = false
      await user.save();
    }
    if (redis) {
      try {
        const SESSION_TTL = 60 * 60 * 24;
        await redis.multi()
          .del(`USER_SESSION:${user._id}`)
          .setex(`USER_SESSION:${user._id}`, SESSION_TTL, token)
          .exec();
        // console.log("✅ USER_SESSION set in Redis");
      } catch (error) {
        console.error("FAILED TO SET USER_SESSION", error);
      }
    }
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
    await invalidateLoginHistoryCache(user._id)
    if (userKey) {
      await resetLoginAttempts(userKey);
    }
    await resetLoginAttempts(ipKey);
    return res.status(200).json({
      message: "Login successfully",
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
    const skip = (page - 1) * limit;

    const loginUser = req.user;
    const ttl =
      loginUser.role === "Admin"
        ? 50000
        : 12 * 60 * 60
    const loginFilter = {};
    let cacheKey = null;

    if (redis) {
      if (loginUser.role === "Admin") {
        cacheKey = `loginHistory:admin:p${page}:l${limit}:s${search}:r${role}:d${date}`
      } else {
        cacheKey = `loginHistory:user:${loginUser.id}:p${page}:l${limit}:s${search}:r${role}:d${date}`;
      }

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          // console.log("⚡ LOGIN HISTORY REDIS HIT");
          return res.json(JSON.parse(cached));
        }
      } catch {
        console.log("Redis get failed");
      }
    }

    // 🔹 1. ROLE BASE FILTER
    if (loginUser.role === "Distributor") {
      const retailerIds = await userModel
        .find({ distributorId: loginUser.id })
        .distinct("_id");

      loginFilter.userId = { $in: [...retailerIds, loginUser.id] };
    } else if (loginUser.role !== "Admin") {
      loginFilter.userId = loginUser.id;
    }

    // 🔹 2. SEARCH USER IDS (only when needed)
    let matchedUserIds = [];
    if (search || role) {
      const userFilter = {};
      const regex = new RegExp(search, "i");

      if (search) {
        userFilter.$or = [
          { name: regex },
          { mobile: regex },
          { UserId: regex },
        ];
      }
      if (role) userFilter.role = role;

      matchedUserIds = await userModel
        .find(userFilter)
        .distinct("_id");
    }

    // 🔹 3. LOGIN SEARCH CONDITIONS
    const loginSearch = [];
    const regex = new RegExp(search, "i");

    if (search) {
      loginSearch.push(
        { mobileNumber: regex },
        { ipAddress: regex },
        { "location.pincode": regex }
      );
    }

    if (matchedUserIds.length) {
      loginSearch.push({ userId: { $in: matchedUserIds } });
    }

    if (loginSearch.length) {
      loginFilter.$or = loginSearch;
    }

    // 🔹 4. DATE FILTER
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      loginFilter.loginTime = { $gte: start, $lte: end };
    }

    // 🔹 5. PARALLEL DB CALLS (BIG WIN 🔥)
    const [logs, totalLogs] = await Promise.all([
      LoginHistory.find(loginFilter)
        .populate("userId", "name mobile role UserId")
        .sort({ loginTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      LoginHistory.countDocuments(loginFilter),
    ]);
    const responseData = {
      success: true,
      page,
      limit,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      logs,
    }
    if (cacheKey && redis) {
      try {
        await redis.setex(
          cacheKey,
          ttl,
          JSON.stringify(responseData),
        );
        console.log("🔥 MongoDB UserHistory(BY ID) HIT");
      } catch (error) {
        console.log("redies set faild from UserHistory api")
      }
    }
    res.status(200).json(responseData);

    // return res.status(200).json({
    //   success: true,
    //   page,
    //   limit,
    //   totalLogs,
    //   totalPages: Math.ceil(totalLogs / limit),
    //   logs,
    // });
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
    let { isBecomeRetailer } = userData
    // console.log("register body", userData)
    // console.log("register auth", req.user)
    isBecomeRetailer = isBecomeRetailer === true || isBecomeRetailer === "true";

    if (isBecomeRetailer === true && !req.user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        success: false,
        code: "FORCE_LOGOUT",
        message: "Please login again to continue become a retailer process",
      });
    }

    const clientSource = userData.clientSource?.toUpperCase() || "PANEL";

    // if (clientSource !== "APP") {
    //   delete userData.referal;
    // }

    const existingUser = await User.findOne({
      $or: [{ mobileNumber: userData.mobileNumber }, { email: userData.email }],
    }).select({
      _id: 1,
      mobileNumber: 1,
      email: 1
    }).session(session);

    let userToSave = null;

    if (existingUser) {
      if (
        isBecomeRetailer === true &&
        req.user &&
        (String(existingUser._id) == String(req.user.id))
      ) {
        delete userData.mobileNumber;
        delete userData.email;
        userToSave = existingUser;
      } else {
        await session.abortTransaction();
        session.endSession();

        if (existingUser.mobileNumber === userData.mobileNumber) {
          return res.status(400).json({
            message: "User Mobile Number already exists",
          });
        }
        if (existingUser.email === userData.email) {
          return res.status(400).json({
            message: "User Email already exists",
          });
        }
      }
    }
    let referredByUser = null;

    if (userData.referal) {
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

    let savedUser;
    if (userToSave) {
      // 🔵 STEP-3: UPDATE EXISTING USER
      Object.assign(userToSave, userData);
      savedUser = await userToSave.save({ session });
    } else {
      // 🟢 BRAND NEW USER
      userData.UserId = await CounterModal.getNextUserId();
      const newUser = new User(userData);
      savedUser = await newUser.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // ✅ Generate JWT
    const token = generateJwtToken(
      savedUser._id,
      savedUser.role,
      savedUser.mobileNumber
    );

    return res.status(200).json({
      message: "Registration successful",
      newUser: savedUser,
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
    // console.log(req.body);

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
    if (role && role !== user.role) {
      user.role = role;
      user.forceLogout = true;
    }
    if (isKycVerified !== undefined) {
      user.isKycVerified = isKycVerified;
    }
    if (agreement !== undefined) user.agreement = agreement;
    if (isVideoKyc !== undefined) user.isVideoKyc = isVideoKyc;
    if (isSpecial !== undefined) user.isSpecial = isSpecial;
    if (shopType) user.shopType = shopType;
    if (shopName) user.shopName = shopName;

    await user.save();
    await invalidateUsersCache();
    await invalidateProfileCache(user._id || user.id);

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
    // await invalidateProfileCache(req.user.id);
    let cacheKey = null
    if (redis) {
      try {
        cacheKey = `profile:self:${req.user.id}`;
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          console.log("UserSelfProfile Hit from Redis")
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (error) {
        console.log("redis error from get UserSelfProfile api")
      }
    }

    let userDoc = await User.findById(
      req.user.id,
      "-mpin -commissionPackage -meta -password -planHistory"
    )
      .populate("role")
      .populate({
        path: "plan.planId",
        populate: { path: "services", model: "Service", select: "defaultSwitch _id isActive" },
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
    if (user?.aadharDetails?.data) {
      delete user.aadharDetails.data.profile_image;
      delete user.aadharDetails.data.raw_xml;
    }
    if (user.plan?.planId?.amount && user.plan?.planType) {
      user.plan.planId.amount = user.plan.planId.amount.filter(
        (a) => a.type === user.plan.planType
      );
    }

    // const userMeta =
    //   (await userMetaModel
    //     .findOne({ userId: req.user.id })
    //     .populate("services.serviceId")) || {};

    let remainingDays = null;
    if (user.plan?.startDate && user.plan?.endDate) {
      const today = new Date();
      const endDate = new Date(user.plan.endDate);
      const diffTime = endDate.getTime() - today.getTime();
      remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    // return res
    //   .status(200)
    //   .json({ user, userMeta, effectivePermissions, remainingDays });

    const responseData = {
      user, effectivePermissions, remainingDays
    }
    if (cacheKey && redis) {
      try {
        await redis.setex(
          cacheKey,
          7200,
          JSON.stringify(responseData),
        );
        console.log("🔥 MongoDB UserSelfProfile HIT");
      } catch (error) {
        console.log("redies set faild from UserSelfProfile api")
      }
    }
    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error in getUserController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getUserId = async (req, res) => {
  try {
    let cacheKey = null
    if (redis) {
      try {
        cacheKey = `profile:user:${req.params.id}`;
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          // console.log("UserProfile Hit from Redis")
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (error) {
        console.log("redis error from get UserProfile api")
      }
    }
    let userDoc = await User.findById(
      req.params.id,
      "-mpin -commissionPackage -meta -password -rolePermissions -extraPermissions -restrictedPermissions -planHistory"
    ).populate("role").populate({ path: "plan.planId", select: "name amount" })
      .populate({ path: "distributorId", select: "id name UserId", })
      .populate("extraPermissions")

    if (!userDoc) {
      return res.status(404).json({ message: "No user found" });
    }

    // ✅ Call method safely
    // const effectivePermissions = await userDoc.getEffectivePermissions();

    // ✅ Convert to object only after calling method
    let user = userDoc.toObject();

    // Remove heavy / sensitive Aadhaar fields
    if (user?.aadharDetails?.data) {
      delete user.aadharDetails.data.profile_image;
      delete user.aadharDetails.data.raw_xml;
    }

    // Filter plan.amount
    // if (user.plan?.planId?.amount && user.plan?.planType) {
    //   user.plan.planId.amount = user.plan.planId.amount.filter(
    //     (a) => a.type === user.plan.planType
    //   );
    // }

    // const userMeta =
    //   (await userMetaModel
    //     .findOne({ userId: req.params.id })
    //     .populate("services.serviceId")) || {};

    // return res.status(200).json({ user, userMeta, effectivePermissions });

    const responseData = {
      user
    }
    if (cacheKey && redis) {
      try {
        await redis.setex(
          cacheKey,
          3600,
          JSON.stringify(responseData),
        );
        console.log("🔥 MongoDB UserProfile(BY ID) HIT");
      } catch (error) {
        console.log("redies set faild from UserProfile api")
      }
    }
    res.status(200).json(responseData);

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
      includePermissions,
      forList
    } = req.query;

    const isDistributorOnly =
      role === "Distributor" && forList == "true" &&
      !keyword &&
      !from &&
      !to &&
      exportType === "false";
    let cacheKeyDis = null
    if (isDistributorOnly && redis) {
      try {
        cacheKeyDis = `users:distributor:list`;
        const cached = await redis.get(cacheKeyDis);
        if (cached) {
          return res.status(200).json(JSON.parse(cached));
        }
      } catch (error) {
        console.log("Distributor List Redis HIT Failed")
      }

      const distributors = await User.find({ role: "Distributor" })
        .select("_id name UserId")
        .sort({ name: 1 })
        .lean();

      const responseData = {
        success: true,
        data: distributors,
      };
      if (redis) {
        try {
          await redis.setex(cacheKeyDis, 35000, JSON.stringify(responseData));
        } catch (error) {
          console.log("Distributor List Set in Redis failed")
        }
      }
      return res.status(200).json(responseData);
    }


    let cacheKey = null
    if (exportType == "false") {
      if (redis) {
        try {
          cacheKey = `users:${req.user.role}:${req.user.id}:${JSON.stringify(req.query)}`;
          const cachedData = await redis.get(cacheKey);
          if (cachedData) {
            // console.log("User List Hit from Redis")
            return res.status(200).json(JSON.parse(cachedData));
          }
        } catch (error) {
          console.log("redis error from get all user api")
        }
      }
    }

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

    let [users, totalUsers] = await Promise.all([
      User.find(filter).select("UserId name email mobileNumber role status isKycVerified eWallet createdAt registrationProgress address")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ])


    // ✅ Effective Permissions add karo
    if (includePermissions) {
      users = await Promise.all(
        users.map(async (u) => {
          const userDoc = await User.findById(u._id);
          const permissions = await userDoc.getEffectivePermissions();

          return {
            ...u,
            effectivePermissions: permissions,
          };
        })
      );
    }

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

    const responseData = {
      success: true,
      data: users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
      },
    };

    // ================= REDIS SAVE (START) =================
    if (exportType === "false") {
      if (cacheKey && redis) {
        try {
          await redis.setex(
            cacheKey,
            500,
            JSON.stringify(responseData),
          );
          // console.log("🔥 Get all user MongoDB HIT");
        } catch (error) {
          console.log("redies set faild from user get api")
        }
      }
    }
    res.status(200).json(responseData);

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
    user.forceLogout = true;
    await user.save();
    await invalidateUsersCache();
    await invalidateProfileCache(userId);
    if (redis) {
      try {
        await redis.del(`USER_SESSION:${userId}`);
      } catch (error) {
        console.log("Nothing", error.message)
      }
    }

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
      status,
      isAccountActive,
      commissionPackage,
      meta,
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
    if (status !== undefined) user.status = status;
    if (commissionPackage) user.commissionPackage = commissionPackage;
    if (isAccountActive !== undefined) user.isAccountActive = isAccountActive;
    if (meta) user.meta = meta;
    if (outletId) user.outletId = outletId;
    if (callbackUrl || callbackUrl == "") user.callbackUrl = callbackUrl;

    await user.save();
    await invalidateProfileCache(user._id || user.id);
    await invalidateUsersCache();
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
    if (redis) {
      try {
        await redis.del(`USER_SESSION:${userId}`);
      } catch (error) {
        console.log("Nothing", error.message)
      }
    }

    await OTP.deleteMany({ mobileNumber });

    res.json({ success: true, message: `${type} updated successfully` });
  } catch (err) {
    console.error("Error updating credential:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// const getDashboardStats = async (req, res, next) => {
//   try {
//     const userRole = req.query.userRole;
//     const user = req.user;
//     // console.log("Dashboard user:", user);
//     const role = user.role;
//     let cacheKey = null
//     if (redis) {
//       cacheKey = `dashboard:${role}:${user.id}`;
//       // console.log("CACHE KEY:", cacheKey);
//       try {
//         const cachedData = await redis.get(cacheKey);
//         if (cachedData) {
//           console.log("⚡DASHBOARD REDIS HIT");
//           return res.status(200).json(JSON.parse(cachedData));
//         }
//       } catch (e) {
//         console.log("Redis dashboard get failed, skipping cache");
//       }
//     }
//     let stats = {
//       userInfo: {
//         name: user.name,
//         role: user.role,
//         wallet: user.eWallet,
//       },
//     };
//     const { startUTC, endUTC } = getISTDayRange();

//     const matchToday = {
//       createdAt: { $gte: startUTC, $lte: endUTC },
//     };

//     const matchUser = (field = "userId") => ({ [field]: user._id });
//     const matchTodayUser = (field = "userId") => ({
//       [field]: user.id,
//       createdAt: { $gte: startUTC, $lte: endUTC },
//     });

//     let todayEarning = 0;
//     let todayCharges = 0;

//     if (["Admin", "Distributor", "Retailer"].includes(role)) {
//       // Today Earnings
//       const earningResult = await CommissionTransaction.aggregate([
//         { $unwind: "$roles" },
//         {
//           $match: {
//             "roles.role": role,
//             "roles.userId": new mongoose.Types.ObjectId(user.id),
//             status: "Success",
//             createdAt: { $gte: startUTC, $lte: endUTC },
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             todayEarning: { $sum: "$roles.commission" },
//           },
//         },
//       ]);

//       todayEarning = earningResult[0]?.todayEarning || 0;

//       // Today Charges
//       const chargeResult = await CommissionTransaction.aggregate([
//         { $unwind: "$roles" },
//         {
//           $match: {
//             "roles.role": role,
//             "roles.userId": new mongoose.Types.ObjectId(user.id),
//             status: "Success",
//             createdAt: { $gte: startUTC, $lte: endUTC },
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             todayCharges: { $sum: "$roles.chargeShare" },
//           },
//         },
//       ]);

//       todayCharges = chargeResult[0]?.todayCharges || 0;
//     }

//     // 🔹 Last 10 transactions
//     let last5Txns = [];
//     if (role === "Admin") {
//       last5Txns = await Transaction.find({})
//         .sort({ createdAt: -1 })
//         .limit(7)
//         .lean();
//     } else if (role === "Distributor") {
//       const retailers = await User.find({ distributorId: user.id }, { _id: 1 });
//       const retailerIds = retailers.map((r) => r._id);

//       last5Txns = await Transaction.find({ user_id: { $in: retailerIds } })
//         .sort({ createdAt: -1 })
//         .limit(7)
//         .lean();
//     } else if (role === "Retailer") {
//       last5Txns = await Transaction.find({ user_id: user.id })
//         .sort({ createdAt: -1 })
//         .limit(7)
//         .lean();
//     }

//     let query = {};
//     if (role === "Admin") {
//       query.role = userRole;
//     } else if (role === "Distributor") {
//       if (role === "Distributor") {
//         query = { distributorId: req.user.id };
//       } else {
//         return res.status(400).json({ status: false, message: "Invalid role" });
//       }
//     }

//     const users = await User.find(query).select(
//       "_id name email eWallet phone UserId"
//     );
//     // 🔹 Admin Dashboard
//     if (role === "Admin") {
//       const [
//         totalUsers,
//         totalRetailers,
//         totalDistributors,
//         totalAepsTxns,
//         totalDmtTxns,
//         totalBbpsTxns,

//         totalPayouts,
//         totalPayIn,

//         totalWalletBalance,
//         todayPayins,
//         todayPayouts,
//         todayTxns,
//         failedTxns,
//         successTxns,
//         activeUsers,
//         activeServices,
//         activeRetailers,
//         activeDistributors,
//         activeUser,
//         totalSpeUser
//       ] = await Promise.all([
//         User.countDocuments(),
//         User.countDocuments({ role: "Retailer" }),
//         User.countDocuments({ role: "Distributor" }),
//         AEPSWithdrawal.countDocuments(),
//         DmtReport.countDocuments(),
//         BbpsHistory.countDocuments(),
//         PayOut.aggregate([
//           {
//             $match: {
//               createdAt: { $gte: startUTC, $lte: endUTC },
//               status: "Success",
//             },
//           },
//           { $group: { _id: null, total: { $sum: "$amount" } } },
//         ]),
//         PayIn.aggregate([
//           {
//             $match: {
//               createdAt: { $gte: startUTC, $lte: endUTC },
//               status: "Success",
//             },
//           },
//           { $group: { _id: null, total: { $sum: "$amount" } } },
//         ]),
//         User.aggregate([
//           { $group: { _id: null, total: { $sum: "$eWallet" } } },
//         ]),
//         PayIn.countDocuments(matchToday),
//         PayOut.countDocuments(matchToday),
//         Transaction.aggregate([
//           {
//             $match: {
//               createdAt: { $gte: startUTC, $lte: endUTC },
//               status: "Success",
//             },
//           },
//           {
//             $facet: {
//               byType: [
//                 {
//                   $group: {
//                     _id: "$transaction_type",
//                     totalAmount: { $sum: "$amount" },
//                     count: { $sum: 1 },
//                   },
//                 },
//               ],
//               byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
//               overall: [
//                 {
//                   $group: {
//                     _id: null,
//                     totalTransactions: { $sum: 1 },
//                     totalAmount: { $sum: "$amount" },
//                   },
//                 },
//               ],
//             },
//           },
//         ]),
//         Transaction.countDocuments({ ...matchToday, status: "Failed" }),
//         Transaction.countDocuments({ ...matchToday, status: "Success" }),
//         User.countDocuments({ status: true, isKycVerified: true }),
//         servicesModal.countDocuments({ isActive: true }),
//         User.countDocuments({
//           role: "Retailer",
//           status: true,
//           isKycVerified: true,
//         }),
//         User.countDocuments({
//           role: "Distributor",
//           status: true,
//           isKycVerified: true,
//         }),
//         User.countDocuments({
//           role: "User",
//           status: true,
//           isKycVerified: true,
//         }),
//         User.countDocuments({
//           role: "User",
//         }),
//       ]);

//       const successRate =
//         successTxns + failedTxns > 0
//           ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
//           : "0.00";

//       stats.common = {
//         users,
//         todayEarning,
//         todayCharges,
//         totalUsers,
//         totalRetailers,
//         totalDistributors,
//         totalSpeUser,
//         activeRetailers,
//         activeDistributors,
//         activeUser,
//         totalAEPS: totalAepsTxns,
//         totalDMT: totalDmtTxns,
//         totalBBPS: totalBbpsTxns,
//         totalPayoutAmount: totalPayouts[0]?.total || 0,
//         totalPayInAmount: totalPayIn[0]?.total || 0,
//         totalWalletBalance: totalWalletBalance[0]?.total || 0,
//         activeUsers,
//         activeServices,
//         today: {
//           payinCount: todayPayins,
//           payoutCount: todayPayouts,
//           transactionCount: todayTxns,
//           successRate: `${successRate}%`,
//           failedTransactions: failedTxns,
//         },
//         recentTransactions: last5Txns,
//       };
//     }

//     // 🔹 Distributor Dashboard
//     else if (role === "Distributor") {
//       const [
//         myRetailers,
//         aepsTxns,
//         dmtTxns,
//         totalWallet,
//         todayPayin,
//         todayPayout,
//         todayTxns,
//         failedTxns,
//         successTxns,
//         activeRetailers,
//       ] = await Promise.all([
//         User.countDocuments({ distributorId: user.id, role: "Retailer" }),
//         AEPSWithdrawal.countDocuments({ userId: user.id }),
//         DmtReport.countDocuments({ user_id: user.id }),
//         User.aggregate([
//           { $match: { distributorId: user.id } },
//           { $group: { _id: null, total: { $sum: "$eWallet" } } },
//         ]),
//         PayIn.countDocuments(matchTodayUser()),
//         PayOut.countDocuments(matchTodayUser()),
//         Transaction.aggregate([
//           {
//             $match: {
//               createdAt: { $gte: startUTC, $lte: endUTC },
//               distributorId: new mongoose.Types.ObjectId(user.id),
//               status: "Success",
//             },
//           },
//           {
//             $facet: {
//               byType: [
//                 {
//                   $group: {
//                     _id: "$transaction_type",
//                     totalAmount: { $sum: "$amount" },
//                     count: { $sum: 1 },
//                   },
//                 },
//               ],
//               byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
//               overall: [
//                 {
//                   $group: {
//                     _id: null,
//                     totalTransactions: { $sum: 1 },
//                     totalAmount: { $sum: "$amount" },
//                   },
//                 },
//               ],
//             },
//           },
//         ]),
//         Transaction.countDocuments({
//           ...matchTodayUser("user_id"),
//           status: "Failed",
//         }),
//         Transaction.countDocuments({
//           ...matchTodayUser("user_id"),
//           status: "Success",
//         }),
//         User.countDocuments({
//           distributorId: user.id,
//           role: "Retailer",
//           status: true,
//         }),
//       ]);

//       const successRate =
//         successTxns + failedTxns > 0
//           ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
//           : "0.00";

//       stats.common = {
//         users,
//         todayEarning,
//         todayCharges,
//         totalUsers: 0,
//         totalRetailers: myRetailers,
//         totalDistributors: 0,
//         activeRetailers,
//         activeDistributors: 0,
//         totalRetailerWallet: totalWallet[0]?.total || 0,
//         totalAEPS: aepsTxns,
//         totalDMT: dmtTxns,
//         today: {
//           payinCount: todayPayin,
//           payoutCount: todayPayout,
//           transactionCount: todayTxns,
//           successRate: `${successRate}%`,
//           failedTransactions: failedTxns,
//         },
//         recentTransactions: last5Txns,
//       };
//     }

//     // 🔹 Retailer/User Dashboard
//     else if (["Retailer", "User"].includes(role)) {
//       const [
//         aeps,
//         dmt,
//         bbps,
//         todayPayin,
//         todayPayout,
//         todayTxns,
//         failedTxns,
//         successTxns,
//       ] = await Promise.all([
//         AEPSWithdrawal.countDocuments({ userId: user.id }),
//         DmtReport.countDocuments({ user_id: user.id }),
//         BbpsHistory.countDocuments({ userId: user.id }),
//         PayIn.countDocuments(matchTodayUser()),
//         PayOut.countDocuments(matchTodayUser()),
//         Transaction.aggregate([
//           {
//             $match: {
//               createdAt: { $gte: startUTC, $lte: endUTC },
//               user_id: new mongoose.Types.ObjectId(user.id),
//               status: "Success",
//             },
//           },
//           {
//             $facet: {
//               byType: [
//                 {
//                   $group: {
//                     _id: "$transaction_type",
//                     totalAmount: { $sum: "$amount" },
//                     count: { $sum: 1 },
//                   },
//                 },
//               ],
//               byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
//               overall: [
//                 {
//                   $group: {
//                     _id: null,
//                     totalTransactions: { $sum: 1 },
//                     totalAmount: { $sum: "$amount" },
//                   },
//                 },
//               ],
//             },
//           },
//         ]),
//         Transaction.countDocuments({
//           ...matchTodayUser("user_id"),
//           status: "Failed",
//         }),
//         Transaction.countDocuments({
//           ...matchTodayUser("user_id"),
//           status: "Success",
//         }),
//       ]);

//       const successRate =
//         successTxns + failedTxns > 0
//           ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
//           : "0.00";

//       stats.common = {
//         todayEarning,
//         todayCharges,
//         totalUsers: 0,
//         totalRetailers: 0,
//         totalDistributors: 0,
//         activeRetailers: 0,
//         activeDistributors: 0,
//         totalAEPS: aeps,
//         totalDMT: dmt,
//         totalBBPS: bbps,
//         today: {
//           payinCount: todayPayin,
//           payoutCount: todayPayout,
//           transactionCount: todayTxns,
//           successRate: `${successRate}%`,
//           failedTransactions: failedTxns,
//         },
//         recentTransactions: last5Txns,
//       };
//     }

//     // return res.status(200).json({
//     //   success: true,
//     //   data: stats,
//     // });
//     const responseData = {
//       success: true,
//       data: stats,
//     };
//     if (cacheKey && redis) {
//       try {
//         await redis.setex(
//           cacheKey,
//           60,
//           JSON.stringify(responseData),
//         );
//         console.log("⚡DASHBOARD HIT FROM DB");
//       } catch (e) {
//         console.log("Redis dashboard set failed", e.message);
//       }
//     }

//     return res.status(200).json(responseData);

//   } catch (err) {
//     console.error("Dashboard Error:", err);
//     return next(err);
//   }
// };

//get service usege


const getDashboardStats = async (req, res, next) => {
  // invalidateAllDashboardCache()
  try {
    const userRole = req.query.userRole;
    const user = req.user;
    const role = user.role;
    let cacheKey = null
    if (redis) {
      cacheKey = `dashboard:${role}:${user.id}`;
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          // console.log("⚡DASHBOARD REDIS HIT");
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (e) {
        console.log("Redis dashboard get failed, skipping cache");
      }
    }
    let stats = {
      userInfo: {
        role: user.role,
      },
    };
    const { startUTC, endUTC } = getISTDayRange();

    const matchToday = {
      createdAt: { $gte: startUTC, $lte: endUTC },
    };

    const matchUser = (field = "userId") => ({ [field]: user._id });
    const matchTodayUser = (field = "userId") => ({
      [field]: new mongoose.Types.ObjectId(user.id),
      createdAt: { $gte: startUTC, $lte: endUTC },
    });

    let todayEarning = 0;
    let todayCharges = 0;

    const result = await CommissionTransaction.aggregate([
      { $unwind: "$roles" },
      {
        $match: {
          "roles.userId": new mongoose.Types.ObjectId(user.id),
          status: "Success",
          createdAt: { $gte: startUTC, $lte: endUTC },
        },
      },
      {
        $group: {
          _id: null,
          todayEarning: { $sum: "$roles.commission" },
          todayCharges: { $sum: "$roles.chargeShare" },
        },
      },
    ]);
    todayEarning = result[0]?.todayEarning || 0;
    todayCharges = result[0]?.todayCharges || 0;


    // 🔹 Last 5 transactions
    let last5Txns = [];
    if (role === "Admin") {
      last5Txns = await Transaction.find({}).select({
        transaction_reference_id: 1,
        transaction_type: 1,
        amount: 1,
        balance_after: 1,
        status: 1,
        payment_mode: 1,
        description: 1,
        createdAt: 1
      })
        .sort({ createdAt: -1 })
        .limit(7)
        .lean();
    } else if (role === "Distributor") {
      const retailers = await User.find({ distributorId: user.id }).distinct("_id");
      if (!retailers.length) {
        last5Txns = [];
      } else {
        last5Txns = await Transaction.find({ user_id: { $in: retailers } }).select({
          transaction_reference_id: 1,
          transaction_type: 1,
          amount: 1,
          balance_after: 1,
          status: 1,
          payment_mode: 1,
          description: 1,
          createdAt: 1
        })
          .sort({ createdAt: -1 })
          .limit(7)
          .lean();
      }
    } else if (role === "Retailer") {
      last5Txns = await Transaction.find({ user_id: user.id }).select({
        transaction_reference_id: 1,
        transaction_type: 1,
        amount: 1,
        balance_after: 1,
        status: 1,
        payment_mode: 1,
        description: 1,
        createdAt: 1
      })
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

    // 🔹 Admin Dashboard
    if (role === "Admin") {
      const [
        totalUsers,
        totalRetailers,
        totalDistributors,
        todayTxns,
        failedTxns,
        successTxns,
        activeUsers,
        activeServices,
        activeRetailers,
        activeDistributors,
        activeUser,
        totalSpeUser
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "Retailer" }),
        User.countDocuments({ role: "Distributor" }),
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startUTC, $lte: endUTC },
              status: "Success",
            },
          },
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
              // byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
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
        User.countDocuments({
          role: "User",
          status: true,
          isKycVerified: true,
        }),
        User.countDocuments({
          role: "User",
        }),
      ]);

      const successRate =
        successTxns + failedTxns > 0
          ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
          : "0.00";

      stats.common = {
        todayEarning,
        todayCharges,
        totalUsers,
        totalRetailers,
        totalDistributors,
        totalSpeUser,
        activeRetailers,
        activeDistributors,
        activeUser,
        activeUsers,
        activeServices,
        today: {
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
        },
        recentTransactions: last5Txns,
      };
    }

    // 🔹 Distributor Dashboard

    else if (role === "Distributor") {
      const retailerIds = await User
        .find({ distributorId: user.id })
        .distinct("_id")
      console.log(retailerIds)
      const [
        myRetailers,
        todayTxns,
        failedTxns,
        successTxns,
        activeRetailers,
      ] = await Promise.all([
        User.countDocuments({ distributorId: user.id, role: "Retailer" }),
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startUTC, $lte: endUTC },
              user_id: { $in: retailerIds },
              status: "Success",
            },
          },
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
          createdAt: { $gte: startUTC, $lte: endUTC },
          user_id: { $in: retailerIds },
          status: "Failed",
        }),

        Transaction.countDocuments({
          createdAt: { $gte: startUTC, $lte: endUTC },
          user_id: { $in: retailerIds },
          status: "Success",
        }),
        User.countDocuments({
          distributorId: user.id,
          role: "Retailer",
          status: true,
          isKycVerified: true
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
        totalRetailers: myRetailers,
        totalDistributors: 0,
        activeRetailers,
        today: {
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
        },
        recentTransactions: last5Txns,
      };
    }

    // 🔹 Retailer/User Dashboard
    else if (["Retailer", "User"].includes(role)) {
      const [
        todayTxns,
        failedTxns,
        successTxns,
      ] = await Promise.all([
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startUTC, $lte: endUTC },
              user_id: new mongoose.Types.ObjectId(user.id),
              status: "Success",
            },
          },
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
        today: {
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
        },
        recentTransactions: last5Txns,
      };
    }


    const responseData = {
      success: true,
      data: stats,
    };
    if (cacheKey && redis) {
      try {
        await redis.setex(
          cacheKey,
          120,
          JSON.stringify(responseData),
        );
        // console.log("⚡DASHBOARD HIT FROM DB");
      } catch (e) {
        console.log("Redis dashboard set failed", e.message);
      }
    }

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Dashboard Error:", err);
    return next(err);
  }
};


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
    await invalidateProfileCache(req.params.id)
    await invalidateUserPermissionsCache(req.params.id)

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
  console.log("hitssss auth")

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
        // await invalidateUsersCache()
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

    await invalidateProfileCache(userId)

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

const getCouponHistory = async (req, res) => {
  try {
    const { status, userId } = req.query;
    const role = req.user.role;

    let filter = {};

    // 🔐 Role based filter
    if (role === "User") {
      filter.userId = new mongoose.Types.ObjectId(req.user.id);
    } else if (role === "Admin") {
      if (userId) {
        filter.userId = new mongoose.Types.ObjectId(userId);
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Optional status filter (for list only)
    if (status) {
      filter.status = status;
    }

    // 📄 Coupon list
    const query = scratchCouponModel.find(filter).sort({ createdAt: -1 });

    if (role === "Admin") {
      query.populate("userId", "name email mobileNumber");
    }

    const coupons = await query.select(
      "serviceName baseAmount cashbackAmount status createdAt scratchedAt"
    );

    // 💰 TOTAL CASHBACK (only SCRATCHED)
    const cashbackMatch = {
      ...filter,
      status: "SCRATCHED",
    };

    const cashbackAgg = await scratchCouponModel.aggregate([
      { $match: cashbackMatch },
      {
        $group: {
          _id: null,
          totalCashback: { $sum: "$cashbackAmount" },
        },
      },
    ]);

    const totalCashback = cashbackAgg[0]?.totalCashback || 0;

    res.json({
      success: true,
      role,
      count: coupons.length,
      totalCashback,
      data: coupons,
    });
  } catch (err) {
    console.error("Coupon history error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const scratchCashback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { couponId } = req.body;
    const id = new mongoose.Types.ObjectId(couponId);
    const user = new mongoose.Types.ObjectId(userId);

    console.log(id);
    console.log(userId);

    // 1️⃣ Find valid coupon
    const coupon = await scratchCouponModel
      .findOne({
        _id: id,
        userId: user,
        status: "UNSCRATCHED",
        expiresAt: { $gt: new Date() },
      })
      .session(session);
    console.log(coupon);

    if (!coupon) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid, expired or already scratched coupon",
      });
    }

    // 2️⃣ Credit wallet (get UPDATED wallet)
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      { $inc: { eWallet: coupon.cashbackAmount } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    // 3️⃣ Mark coupon as scratched
    coupon.status = "SCRATCHED";
    coupon.scratchedAt = new Date();
    await coupon.save({ session });

    // 4️⃣ Create transaction entry
    await Transaction.create(
      [
        {
          user_id: userId,
          transaction_type: "credit",
          type2: "CASHBACK",
          amount: coupon.cashbackAmount,
          totalCredit: coupon.cashbackAmount,
          balance_after: updatedUser.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: `CB-${coupon.serviceTxnId}`,
          status: "Success",
          description: `Scratch cashback for ${coupon.serviceName}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.json({
      success: true,
      cashbackAmount: coupon.cashbackAmount,
      walletBalance: updatedUser.eWallet,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Scratch Cashback Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to scratch coupon",
    });
  } finally {
    session.endSession();
  }
};

// become ret

const getUserActions = async (req, res) => {
  try {
    // 🔐 Admin check
    if (!["Admin", "Sub Admin", "superAdmin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    let {
      page = 1,
      limit = 10,
      search,
      actionType,
      status,
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const matchStage = {};

    // 🔎 filter by actionType
    if (actionType) {
      matchStage.actionType = actionType;
    }

    // 🔎 filter by status
    if (status) {
      matchStage.status = status;
    }

    const pipeline = [
      // 1️⃣ join user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // 2️⃣ search (UserId / mobile / email)
      ...(search
        ? [
          {
            $match: {
              $or: [
                { "user.UserId": { $regex: search, $options: "i" } },
                { "user.mobileNumber": { $regex: search, $options: "i" } },
                { "user.email": { $regex: search, $options: "i" } },
              ],
            },
          },
        ]
        : []),

      // 3️⃣ action filters
      { $match: matchStage },

      // 4️⃣ sort latest first
      { $sort: { createdAt: -1 } },

      // 5️⃣ pagination
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                actionType: 1,
                fromRole: 1,
                toRole: 1,
                status: 1,
                createdAt: 1,
                actedAt: 1,
                user: {
                  _id: "$user._id",
                  UserId: "$user.UserId",
                  name: "$user.name",
                  mobileNumber: "$user.mobileNumber",
                  email: "$user.email",
                  role: "$user.role",
                },
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await userModalActionModal.aggregate(pipeline);

    const actions = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: actions,
    });
  } catch (error) {
    console.error("getUserActions error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const createUserAction = async (req, res) => {
  try {
    const { actionType, toRole } = req.body;
    const ALLOWED_ACTIONS = [
      "BECOME_RETAILER",
      "BECOME_DISTRIBUTOR",
      "BECOME_API_PARTNER",
      "ACCOUNT_SUSPEND",
      "ACCOUNT_DEACTIVATE",
      "ACCOUNT_REACTIVATE",
    ];
    if (!actionType) {
      return res.status(400).json({
        success: false,
        message: "missing required fields (actionType)",
      });
    }
    if (!ALLOWED_ACTIONS.includes(actionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request type",
      });
    }
    if (["BECOME_RETAILER", "BECOME_DISTRIBUTOR", "BECOME_API_PARTNER"].includes(actionType)) {
      if (!toRole) {
        return res.status(400).json({
          success: false,
          message: "missing required fields (toRole)",
        });
      }
    }
    const user = await userModel.findById(req.user.id).select({
      _id: 1,
      role: 1,
      UserActionStatus: 1,
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "user not found",
      });
    }

    if (user.UserActionStatus === true) {
      return res.status(400).json({
        success: false,
        message:
          "Your request is already under review. Our admin team is currently verifying your details. You will be notified once a decision is made.",
      });
    }

    const existing = await userModalActionModal.findOne({
      userId: user._id,
      actionType,
      status: "PENDING",
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Request already submitted"
      });
    }
    const payload = {
      userId: user._id,
      actionType,
      fromRole: user.role,
    };

    if (toRole) payload.toRole = toRole;

    const response = await userModalActionModal.create(payload);
    user.UserActionStatus = true;
    await user.save();

    return res.status(200).json({
      success: true,
      response,
      message: "request submitted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Please Try again Later",
    });
  }
};

const sendRoleApprovalEmail = async (user, role) => {
  try {
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
            role: role ?? "User",
            company_name: "Finunique Small Private Limited",
            currentYear: new Date().getFullYear(),
          },
        },
      ],
      from: {
        name: "Finunique Small Private Limited",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      template_id: "user_notification",
    };
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
    console.log(" Role approval email sent:", res.data);
  } catch (error) {
    console.error(" Error sending role approval email:", error.message);
  }
};

const approveUserAction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { actionId, status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false, message: "Invalid status value"
      });
    }

    if (!["Admin", "Sub Admin", "superAdmin"].includes(req.user.role)) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const action = await userModalActionModal.findOneAndUpdate(
      { _id: actionId, status: "PENDING" },
      { status, actedAt: new Date(), actedBy: req.user.id },
      { new: true, session }
    );

    if (!action) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Action already processed",
      });
    }

    let user = null;

    if (status === "APPROVED") {
      user = await userModel.findById(action.userId).select({
        role: 1,
        forceLogout: 1,
        isKycVerified: 1,
        agreement: 1,
        isVideoKyc: 1,
        email: 1,
        name: 1,
        UserActionStatus: 1
      }).session(session);


      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      if (action.actionType === "BECOME_DISTRIBUTOR") {
        user.role = action.toRole;
      }
      if (action.actionType === "BECOME_RETAILER") {
        user.role = action.toRole;
      }
      if (action.actionType === "ACCOUNT_DEACTIVATE") {
        user.status = false;
      }
      user.forceLogout = true;
      user.isKycVerified = true;
      user.isVideoKyc = false;
      user.agreement = false;
      user.UserActionStatus = false
      await user.save({ session });
      if (redis) {
        try {
          await redis.del(`USER_SESSION:${action.userId || user._id || user.id}`);
        } catch (error) {
          console.log("Nothing")
        }
      }
    } else if (status === "REJECTED") {
      user = await userModel.findById(action.userId).select({
        UserActionStatus: 1
      }).session(session);

      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      user.UserActionStatus = false;
      await user.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    if (status === "APPROVED" && user) {
      sendRoleApprovalEmail(user, action.toRole).catch(() => { });
    }

    return res.status(200).json({
      success: true,
      message:
        status === "APPROVED"
          ? "Action approved successfully"
          : "Action rejected successfully",
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Network busy please try after some time",
    });
  }
};


module.exports = {
  sendOtpController,
  verifyOTPController,
  registerUser,
  loginController,
  logoutController,
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
  getCouponHistory,
  scratchCashback,
  createUserAction,
  approveUserAction,
  getUserActions
}
