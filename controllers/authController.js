const User = require("../models/userModel.js");
const { generateOtp, verifyOtp } = require("../services/otpService");
const { sendOtp } = require("../services/smsService");
const { generateJwtToken } = require("../services/jwtService");
const { parse } = require('json2csv');
const userMetaModel = require("../models/userMetaModel.js");
const PayIn = require("../models/payInModel.js");
const PayOut = require("../models/payOutModel.js");
const AEPSWithdrawal = require("../models/aepsModels/withdrawalEntry.js");
const DmtReport = require("../models/dmtTransactionModel.js");
const BbpsHistory = require("../models/bbpsModel.js");
const { default: axios } = require("axios");

const sendOtpController = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({ message: "Mobile number is required" });
    }
    const otp = await generateOtp(mobileNumber);
    const smsResult = await sendOtp(mobileNumber, otp);
    if (smsResult.success) {
      return res.status(200).json({ message: "OTP sent successfully" });
    } else {
      return res.status(400).json({ message: smsResult.message });
    }
  } catch (error) {
    console.error("Error in sendOtpController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({ message: "Mobile number and OTP are required" });
    }
    const verificationResult = await verifyOtp(mobileNumber, otp);
    if (!verificationResult.success) {
      return res.status(400).json({ message: verificationResult.message });
    }

    return res.status(200).json({
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Error in verifyOTPController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const loginController = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({ message: "Mobile number and OTP are required" });
    }
    const verificationResult = await verifyOtp(mobileNumber, otp);
    if (!verificationResult.success) {
      return res.status(400).json({ message: verificationResult.message });
    }
    let user = await User.findOne({ mobileNumber });

    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }
    if (user.status === false) {
      return res.status(403).json({ message: "Your account is blocked. Please contact support." });
    }

    const token = generateJwtToken(user._id, user.role, user.mobileNumber);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        mobileNumber: user.mobileNumber,
        token
      },
    });
  } catch (error) {
    console.error("Error in loginController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      mobileNumber,
      address,
      pinCode,
      mpin,
      role,
      distributorId,
      businessName,
      businessType
    } = req.body;

    let user = await User.findOne({ $or: [{ email }, { mobileNumber }] });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    let adminUser;
    if (!distributorId) {
      adminUser = await User.findOne({ role: 'Admin' });
    }

    let shopPhotoPaths = [];
    if (req.files?.shopPhoto) {
      shopPhotoPaths = req.files.shopPhoto.map(file => `/uploads/${file.filename}`);
    }

    const ownerPhoto = req.files?.ownerPhoto ? `/uploads/${req.files.ownerPhoto[0].filename}` : "";

    let newUserObj = {
      name,
      email,
      mobileNumber,
      address,
      pinCode,
      mpin,
      role,
      businessName,
      businessType,
      shopPhoto: shopPhotoPaths,
      ownerPhoto,
      status: role === "User" ? true : false,
      distributorId: distributorId ? distributorId : adminUser?._id,
    };

    let NewUser = await User.create(newUserObj);
    const token = generateJwtToken(NewUser._id, NewUser.role, NewUser.mobileNumber);

    // ✅ Lead API call using axios
    try {
      const leadResponse = await axios.post(
        "https://cms.sevenunique.com/apis/leads/set-leads.php",
        {
          website_id: 6,
          name: NewUser.name,
          mobile_number: NewUser.mobileNumber,
          email: NewUser.email,
          address:NewUser.address,
          client_type:NewUser.role,
          notes: "Lead from FinUnique small private limited",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer jibhfiugh84t3324fefei#*fef",
          },
        }
      );

      console.log("Lead API Response:", leadResponse.data);
    } catch (leadError) {
      console.error("Error sending lead data:", leadError.response ? leadError.response.data : leadError.message);
    }

    return res.status(200).json({
      message: "Registration successful",
      newUser: NewUser,
      token
    });
  } catch (error) {
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
        country: address.country || 'India'
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
    let user = await User.findById(req.user.id, '-mpin -commissionPackage -meta -aadharDetails -panDetails');
    let userMeta = await userMetaModel.findOne({ userId: req.user.id }).populate('services.serviceId', '-providers -serviceFor') || {};
    if (!user) {
      return res.status(404).json({ message: "No user found" });
    }
    return res.status(200).json({ user, userMeta });
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
      sortBy = 'name',
      order = 'asc',
      page = 1,
      limit = 10,
      exportCsv = 'false'
    } = req.query;

    const filter = {};

    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const loggedInUser = req.user;

    if (loggedInUser.role === 'Distributor') {
      filter.distributorId = loggedInUser.id;
    }

    const sort = {};
    sort[sortBy] = order === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .sort(sort)
      .skip(exportCsv === 'true' ? 0 : skip)
      .limit(exportCsv === 'true' ? Number.MAX_SAFE_INTEGER : parseInt(limit));

    if (exportCsv === 'true') {
      const fields = [
        '_id',
        'name',
        'email',
        'role',
        'mobileNumber',
        'status',
        'distributorId',
        'isKycVerified',
        'eWallet',
        'cappingMoney',
        'createdAt',
        'updatedAt'
      ];

      const csv = parse(users, { fields });
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename=users.csv');
      return res.send(csv);
    }
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
      return res.status(400).json({ message: "User ID and status are required" });
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
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;

    const { role, status, isAccountActive, commissionPackage, cappingMoney, eWallet, meta } = req.body;

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

    await user.save();
    return res.status(200).json({
      message: "User details updated successfully"
    });
  } catch (error) {
    console.error("Error in updateUserDetails:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const Transaction = require('../models/transactionModel.js');
const servicesModal = require("../models/servicesModal.js");

const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const getDashboardStats = async (req, res, next) => {
  try {
    const user = req.user;
    const role = user.role;

    let stats = {
      userInfo: {
        name: user.name,
        role: user.role,
        wallet: user.eWallet,
      }
    };

    const matchToday = {
      createdAt: { $gte: startOfToday }
    };

    const matchUser = (field = 'userId') => ({ [field]: user._id });
    const matchTodayUser = (field = 'userId') => ({
      [field]: user._id,
      createdAt: { $gte: startOfToday }
    });

    // Admin dashboard
    if (role === 'Admin') {
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
        activeServices
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'Retailer' }),
        User.countDocuments({ role: 'Distributor' }),
        AEPSWithdrawal.countDocuments(),
        DmtReport.countDocuments(),
        BbpsHistory.countDocuments(),
        PayOut.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
        PayIn.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
        User.aggregate([{ $group: { _id: null, total: { $sum: "$eWallet" } } }]),
        PayIn.countDocuments(matchToday),
        PayOut.countDocuments(matchToday),
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfToday }
            }
          },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                  }
                }
              ],
              byStatus: [
                {
                  $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                  }
                }
              ],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                  }
                }
              ]
            }
          }
        ]),
        Transaction.countDocuments({ ...matchToday, status: "Failed" }),
        Transaction.countDocuments({ ...matchToday, status: "Success" }),
        User.countDocuments({ status: true }),
        servicesModal.countDocuments({ "isActive": true })
      ]);

      const successRate = successTxns + failedTxns > 0
        ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
        : "0.00";

      stats.overview = {
        totalUsers,
        totalRetailers,
        totalDistributors,
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
          failedTransactions: failedTxns
        }
      };

    } else if (role === 'Distributor') {
      const [
        myRetailers,
        myCommission,
        aepsTxns,
        dmtTxns,
        totalWallet,
        todayPayin,
        todayPayout,
        todayTxns,
        failedTxns,
        successTxns,

      ] = await Promise.all([
        User.countDocuments({ distributorId: user._id, role: 'Retailer' }),
        PayIn.aggregate([
          { $match: { userId: user._id, status: "Success" } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        AEPSWithdrawal.countDocuments({ userId: user._id }),
        DmtReport.countDocuments({ user_id: user._id }),
        User.aggregate([
          { $match: { distributorId: user._id } },
          { $group: { _id: null, total: { $sum: "$eWallet" } } }
        ]),
        PayIn.countDocuments(matchTodayUser()),
        PayOut.countDocuments(matchTodayUser()),
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfToday }
            }
          },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                  }
                }
              ],
              byStatus: [
                {
                  $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                  }
                }
              ],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                  }
                }
              ]
            }
          }
        ]),
        Transaction.countDocuments({ ...matchTodayUser('user_id'), status: "Failed" }),
        Transaction.countDocuments({ ...matchTodayUser('user_id'), status: "Success" }),
      ]);

      const successRate = successTxns + failedTxns > 0
        ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
        : "0.00";

      stats.distributor = {
        retailersUnderYou: myRetailers,
        totalCommissionEarned: myCommission[0]?.total || 0,
        totalRetailerWallet: totalWallet[0]?.total || 0,
        aepsTransactions: aepsTxns,
        dmtTransactions: dmtTxns,
        today: {
          payinCount: todayPayin,
          payoutCount: todayPayout,
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
          failedTransactions: failedTxns
        }
      };

    } else if (['Retailer', 'User'].includes(role)) {
      const [
        aeps,
        dmt,
        bbps,
        txns,
        todayPayin,
        todayPayout,
        todayTxns,
        failedTxns,
        successTxns
      ] = await Promise.all([
        AEPSWithdrawal.countDocuments({ userId: user._id }),
        DmtReport.countDocuments({ user_id: user._id }),
        BbpsHistory.countDocuments({ userId: user._id }),
        Transaction.find({ user_id: user._id }).sort({ createdAt: -1 }).limit(5),
        PayIn.countDocuments(matchTodayUser()),
        PayOut.countDocuments(matchTodayUser()),
        Transaction.aggregate([
          {
            $match: {
              createdAt: { $gte: startOfToday }
            }
          },
          {
            $facet: {
              byType: [
                {
                  $group: {
                    _id: "$transaction_type",
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                  }
                }
              ],
              byStatus: [
                {
                  $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                  }
                }
              ],
              overall: [
                {
                  $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                  }
                }
              ]
            }
          }
        ]),
        Transaction.countDocuments({ ...matchTodayUser('user_id'), status: "Failed" }),
        Transaction.countDocuments({ ...matchTodayUser('user_id'), status: "Success" })
      ]);

      const successRate = successTxns + failedTxns > 0
        ? ((successTxns / (successTxns + failedTxns)) * 100).toFixed(2)
        : "0.00";

      stats.user = {
        totalAEPS: aeps,
        totalDMT: dmt,
        totalBBPS: bbps,
        recentTransactions: txns,
        today: {
          payinCount: todayPayin,
          payoutCount: todayPayout,
          transactionCount: todayTxns,
          successRate: `${successRate}%`,
          failedTransactions: failedTxns
        }
      };
    }

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (err) {
    console.error("Dashboard Error:", err);
    return next(err);
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
  getDashboardStats
};