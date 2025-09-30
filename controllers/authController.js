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
const sendOtpController = async (req, res) => {
  try {
    const { mobileNumber, isRegistered, ifLogin } = req.body;
    console.log("📩 Request Body:", req.body);

    // ✅ Validation
    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required"
      });
    }

    // ✅ Find user once and reuse
    const userExisting = await User.findOne({ mobileNumber });

    // ✅ Register flow: stop if user already exists
    if (isRegistered === true) {
      if (userExisting) {
        return res.status(400).json({
          success: false,
          message: "User already registered"
        });
      }
    }

    // ✅ Login flow: stop if user does not exist
    if (ifLogin === true) {
      if (!userExisting) {
        return res.status(404).json({
          success: false,
          message: "User not found"
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
        data: { mobileNumber } // optional, can remove if you want
      });
    } else {
      return res.status(400).json({
        success: false,
        message: smsResult.message || "Failed to send OTP"
      });
    }

  } catch (error) {
    console.error("❌ Error in sendOtpController:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    // ✅ Validation
    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required"
      });
    }

    // ✅ Verify OTP
    const verificationResult = await verifyOtp(mobileNumber, otp);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || "Invalid OTP"
      });
    }

    // ✅ Success
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully"
    });

  } catch (error) {
    console.error("❌ Error in verifyOTPController:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};


// const loginController = async (req, res) => {
//   try {
//     const { mobileNumber, otp } = req.body;

//     if (!mobileNumber || !otp) {
//       return res
//         .status(400)
//         .json({ message: "Mobile number and OTP are required" });
//     }
//     const verificationResult = await verifyOtp(mobileNumber, otp);
//     if (!verificationResult.success) {
//       return res.status(400).json({ message: verificationResult.message });
//     }
//     let user = await User.findOne({ mobileNumber });

//     if (!user) {
//       return res.status(404).json({ message: "No user found" });
//     }
//     if (user.status === false) {
//       return res
//         .status(403)
//         .json({ message: "Your account is blocked. Please contact support." });
//     }

//     const token = generateJwtToken(user._id, user.role, user.mobileNumber);

//     return res.status(200).json({
//       message: "Login successful",
//       user: {
//         id: user._id,
//         mobileNumber: user.mobileNumber,
//         token,
//       },
//     });
//   } catch (error) {
//     console.error("Error in loginController:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// const registerUser = async (req, res) => {
//   try {
//     const {
//       name,
//       email,
//       mobileNumber,
//       address,
//       pinCode,
//       mpin,
//       role,
//       distributorId,
//       businessName,
//       businessType,

//     } = req.body;

//     let user = await User.findOne({ $or: [{ email }, { mobileNumber }] });
//     if (user) {
//       return res.status(400).json({ message: "User already exists" });
//     }

//     let adminUser;
//     if (!distributorId) {
//       adminUser = await User.findOne({ role: "Admin" });
//     }

//     let shopPhotoPaths = [];
//     if (req.files?.shopPhoto) {
//       shopPhotoPaths = req.files.shopPhoto.map(
//         (file) => `/uploads/${file.filename}`
//       );
//     }

//     const ownerPhoto = req.files?.ownerPhoto
//       ? `/uploads/${req.files.ownerPhoto[0].filename}`
//       : "";

//     let newUserObj = {
//       name,
//       email,
//       mobileNumber,
//       address,
//       pinCode,
//       mpin,
//       role,
//       businessName,
//       businessType,
//       shopPhoto: shopPhotoPaths,
//       ownerPhoto,
//       status: role === "User" ? true : false,
//       distributorId: distributorId ? distributorId : adminUser?._id,
//     };

//     let NewUser = await User.create(newUserObj);
//     const token = generateJwtToken(
//       NewUser._id,
//       NewUser.role,
//       NewUser.mobileNumber
//     );

//     // ✅ Lead API call using axios
//     try {
//       const leadResponse = await axios.post(
//         "https://cms.sevenunique.com/apis/leads/set-leads.php",
//         {
//           website_id: 6,
//           name: NewUser.name,
//           mobile_number: NewUser.mobileNumber,
//           email: NewUser.email,
//           address: NewUser.address,
//           client_type: NewUser.role,
//           notes: "Lead from FinUnique small private limited",
//         },
//         {
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: "Bearer jibhfiugh84t3324fefei#*fef",
//           },
//         }
//       );

//       console.log("Lead API Response:", leadResponse.data);
//     } catch (leadError) {
//       console.error(
//         "Error sending lead data:",
//         leadError.response ? leadError.response.data : leadError.message
//       );
//     }

//     return res.status(200).json({
//       message: "Registration successful",
//       newUser: NewUser,
//       token,
//     });
//   } catch (error) {
//     console.error("Error in registerUser controller:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

const loginController = async (req, res) => {
  try {
    const { mobileNumber, password, otp } = req.body;

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

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        mobileNumber: user.mobileNumber,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("Error in loginController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const registerUser = async (req, res) => {
  try {
    let userData = { ...req.body };
    console.log("body...............", userData);
    const existingUser = await User.findOne({
      $or: [{ mobileNumber: userData.mobileNumber }, { email: userData.email }],
    });

    if (existingUser) {
      if (existingUser.mobileNumber === userData.mobileNumber) {
        return res
          .status(400)
          .json({ message: "User Mobile Number already exists" });
      }
      if (existingUser.email === userData.email) {
        return res.status(400).json({ message: "User Email already exists" });
      }
    }

    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(userData.password, salt);
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
    }

    // ✅ Create user
    userData.UserId = await CounterModal.getNextUserId();
    const NewUser = new User(userData);
    await NewUser.save();

    // ✅ Generate JWT
    const token = generateJwtToken(
      NewUser._id,
      NewUser.role,
      NewUser.mobileNumber
    );

    // ✅ Send lead to external API
    try {
      await axios.post(
        "https://cms.sevenunique.com/apis/leads/set-leads.php",
        {
          website_id: 6,
          name: NewUser.name,
          mobile_number: NewUser.mobileNumber,
          email: NewUser.email,
          address: NewUser.address,
          client_type: NewUser.role,
          notes: "Lead from FinUnique small private limited",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer jibhfiugh84t3324fefei#*fef",
          },
        }
      );
    } catch (leadError) {
      console.error(
        "Error sending lead data:",
        leadError.response ? leadError.response.data : leadError.message
      );
    }

    return res.status(200).json({
      message: "Registration successful",
      newUser: NewUser,
      token,
    });
  } catch (error) {
    console.log("eeeeeeeeeeeeeee", error);
    console.error("Error in registerUser controller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateProfileController = async (req, res) => {
  try {
    const { name, email, mpin, bankDetails, address, pinCode } = req.body;

    let user = await User.findById(req.user.id);
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
        city: address.city,
        state: address.state,
        country: address.country || "India",
      };
    }
    if (pinCode) user.pinCode = pinCode;

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
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
      }).populate('distributorId')
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
      }).populate({
        path: "distributorId",
        select: "id name"
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
      sortBy = "name",
      order = "asc",
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
    console.log("query...", req.query);

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
        "name",
        "email",
        "role",
        "mobileNumber",
        "status",
        "isKycVerified",
      ];
    } else {
      fields = [
        "name",
        "email",
        "role",
        "mobileNumber",
        "status",
        "isKycVerified",
        "eWallet",
        "cappingMoney",
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
          "Name",
          "Email",
          "Role",
          "Mobile Number",
          "Status",
          "KYC Status",
          "Created At",
        ];
        rows = users.map((u, i) => [
          i + 1,
          u.name,
          u.email,
          u.role,
          u.mobileNumber,
          u.status,
          u.isKycVerified ? "Verified" : "Not Verified",
          u.createdAt ? new Date(u.createdAt).toLocaleString() : "-",
        ]);
      } else {
        // 🔹 Normal export with more fields
        headers = [
          "#",
          "Name",
          "Email",
          "Role",
          "Mobile Number",
          "Status",
          "KYC Status",
          "eWallet",
          "Capping Money",
          "Created At",
          "Updated At",
        ];
        rows = users.map((u, i) => [
          i + 1,
          u.name,
          u.email,
          u.role,
          u.mobileNumber,
          u.status,
          u.isKycVerified ? "Verified" : "Not Verified",
          u.eWallet,
          u.cappingMoney,
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

    await user.save();
    return res.status(200).json({
      message: "User details updated successfully",
    });
  } catch (error) {
    console.error("Error in updateUserDetails:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const Transaction = require("../models/transactionModel.js");
const servicesModal = require("../models/servicesModal.js");

const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const getDashboardStats = async (req, res, next) => {
  try {
    const user = req.user;
    console.log("Dashboard user:", user);
    const role = user.role;

    let stats = {
      userInfo: {
        name: user.name,
        role: user.role,
        wallet: user.eWallet,
      },
    };

    const matchToday = {
      createdAt: { $gte: startOfToday },
    };

    const matchUser = (field = "userId") => ({ [field]: user._id });
    const matchTodayUser = (field = "userId") => ({
      [field]: user.id,
      createdAt: { $gte: startOfToday },
    });

    let todayEarning = 0;
    let todayCharges = 0;

    if (["Admin", "Distributor", "Retailer"].includes(role)) {
      // Today’s start and end
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Today Earnings
      const earningResult = await CommissionTransaction.aggregate([
        { $unwind: "$roles" },
        {
          $match: {
            "roles.role": role,
            "roles.userId": new mongoose.Types.ObjectId(user.id),
            status: "Success",
            createdAt: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: null,
            todayEarning: { $sum: "$roles.totalEarned" },
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
            createdAt: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: null,
            todayCharges: { $sum: "$roles.charge" }, // 👈 assuming 'charge' field exists
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
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        PayIn.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        User.aggregate([
          { $group: { _id: null, total: { $sum: "$eWallet" } } },
        ]),
        PayIn.countDocuments(matchToday),
        PayOut.countDocuments(matchToday),
        Transaction.aggregate([
          { $match: { createdAt: { $gte: startOfToday } } },
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
        User.countDocuments({ status: true }),
        servicesModal.countDocuments({ isActive: true }),
        User.countDocuments({ role: "Retailer", status: true }),
        User.countDocuments({ role: "Distributor", status: true }),
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
          { $match: { createdAt: { $gte: startOfToday } } },
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
          { $match: { createdAt: { $gte: startOfToday } } },
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
      // ✅ distributor ke niche ke saare retailers ke userId nikal lo
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
    const user = req.user; // ✅ token se aa raha hai
    let matchQuery = {};

    // 🔹 Role check
    if (user.role === "Admin") {
      matchQuery = {}; // pura system
    } else if (user.role === "Distributor") {
      // apne niche ke saare retailers ke ID nikal lo
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

const updateUserPermissions = async (req, res) => {
  try {
    let { extraPermissions = [], restrictedPermissions = [] } = req.body;

    const Permission = mongoose.model("Permission");

    const resolveIdsFromKeys = async (items) => {
      // Agar item string aur ObjectId valid nahi hai, assume it's a key
      const docs = await Permission.find({
        $or: [
          { _id: { $in: items.filter(mongoose.Types.ObjectId.isValid) } },
          { key: { $in: items } },
        ],
      });

      return docs.map((p) => p._id.toString());
    };

    extraPermissions = await resolveIdsFromKeys(extraPermissions);
    restrictedPermissions = await resolveIdsFromKeys(restrictedPermissions);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { extraPermissions, restrictedPermissions },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      ...user.toObject(),
      effectivePermissions: await user.getEffectivePermissions(),
    });
  } catch (err) {
    console.error("Error in updateUserPermissions:", err);
    return res.status(500).json({ message: err.message });
  }
};

// GET /users/:id/permissions
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
  getDashboardStats,
  updateUserPermissions,
  getUserPermissions,
  getServiceUsage,
  getPayInPayOutReport,
  getUserId
};
