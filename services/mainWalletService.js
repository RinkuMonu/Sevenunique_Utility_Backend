const PayIn = require("../models/payInModel");
const PayOut= require("../models/payOutModel");
const User =require("../models/userModel");
 
const userWallet = async (userId) => {
    try {
        console.log("User ID:", userId);
 
        const mongoose = require('mongoose');
        const userObjectId = new mongoose.Types.ObjectId(userId);
 
        // Step 1: Approved PayIn Transactions
        const payInData = await PayIn.aggregate([
            { $match: { status: "Approved", userId: userObjectId } },
            { $group: { _id: "$userId", totalPayIn: { $sum: "$amount" } } }
        ]);
 
        // Step 2: Approved PayOut Transactions
        const payOutData = await PayOut.aggregate([
            { $match: { status: "Approved", userId: userObjectId } },
            { $group: { _id: "$userId", totalPayOut: { $sum: {$toDouble: "$amount" }} } }
        ]);
 
        // Step 3: Failed & Pending PayIn Transactions
        const pendingPayIn = await PayIn.aggregate([
            { $match: { status: { $in: ["Pending"] }, userId: userObjectId } },
            { $group: { _id: "$userId", totalPendingPayIn: { $sum: "$amount" } } }
        ]);
 
        // Step 4: Failed & Pending PayIn Transactions
        const failedPayIn = await PayIn.aggregate([
            { $match: { status: { $in: ["Failed"] }, userId: userObjectId } },
            { $group: { _id: "$userId", totalFailedPayIn: { $sum: "$amount" } } }
        ]);
 
        // Step 5: Failed & Pending PayOut Transactions
        const pendingPayOut = await PayOut.aggregate([
            { $match: { status: { $in: ["Pending"] }, userId: userObjectId } },
            { $group: { _id: "$userId", totalPendingPayOut: { $sum: {$toDouble: "$amount" }} } }
        ]);
 
         // Step 6: Failed & Pending PayOut Transactions
         const failedPayOut = await PayOut.aggregate([
            { $match: { status: { $in: ["Failed"] }, userId: userObjectId } },
            { $group: { _id: "$userId", totalFailedPayOut: { $sum: {$toDouble: "$amount" }} } }
        ]);
 
        // Converting results into maps for lookup
        const payInMap = {};
        payInData.forEach(item => payInMap[item._id.toString()] = item.totalPayIn || 0);
 
        const payOutMap = {};
        payOutData.forEach(item => payOutMap[item._id.toString()] = item.totalPayOut || 0);
 
        const pendingPayInMap = {};
        pendingPayIn.forEach(item => pendingPayInMap[item._id.toString()] = item.totalPendingPayIn || 0);
 
        const failedPayInMap = {};
        failedPayIn.forEach(item => failedPayInMap[item._id.toString()] = item.totalFailedPayIn || 0);
 
        const pendingPayOutMap = {};
        pendingPayOut.forEach(item => pendingPayOutMap[item._id.toString()] = item.totalPendingPayOut || 0);
 
        const failedPayOutMap = {};
        failedPayOut.forEach(item => failedPayOutMap[item._id.toString()] = item.totalPendingPayOut || 0);
 
        // Fetch user details
        const user = await User.findById(userObjectId);
        if (!user) throw new Error("User not found.");
 
        // Calculating balances
        const totalPayIn = payInMap[user._id.toString()] || 0;
        const totalPayOut = payOutMap[user._id.toString()] || 0;
        const pendingPayInTotal = pendingPayInMap[user._id.toString()] || 0;
        const failedPayInTotal = failedPayInMap[user._id.toString()] || 0;
        const pendingPayOutTotal = pendingPayOutMap[user._id.toString()] || 0;
        const failedPayOutTotal = failedPayOutMap[user._id.toString()] || 0;
        const availableBalance = totalPayIn - totalPayOut;
 
        // Preparing response data
        const data = {
            _id: user._id,
            name: user.name,
            email: user.email,
            mobileNumber: user.mobileNumber,
            role: user.role,
            totalPayIn,
            totalPayOut,
            pendingPayInTotal,
            failedPayInTotal,
            pendingPayOutTotal,
            failedPayOutTotal,
            availableBalance
        };
 
        console.log("User Wallet Data:", data);
        return data;
 
    } catch (error) {
        console.error("Error in user wallet report:", error);
        throw error;
    }
};
 
 
 
const allUserWallet = async() => {
 try {
      // Step 1: Approved PayIn Transactions
      const payInData = await PayIn.aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: "$userId", totalPayIn: { $sum: "$amount" } } }
    ]);
 
    // Step 2: Approved PayOut Transactions
    const payOutData = await PayOut.aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: "$userId", totalPayOut: { $sum: {$toDouble: "$amount"} } } }
    ]);
 
    // Step 3: Failed & Pending PayIn Transactions
    const pendingPayIn = await PayIn.aggregate([
        { $match: { status: "Pending" } },
        { $group: { _id: "$userId", totalPendingPayIn: { $sum: "$amount" } } }
    ]);
 
    // Step 4: Failed & Pending PayIn Transactions
    const failedPayIn = await PayIn.aggregate([
        { $match: { status: "Failed" } },
        { $group: { _id: "$userId", totalFailedPayIn: { $sum: "$amount" } } }
    ]);
 
    // Step 5: Failed & Pending PayOut Transactions
    const pendingPayOut = await PayOut.aggregate([
        { $match: { status: "Pending" } },
        { $group: { _id: "$userId", totalPendingPayOut: { $sum: {$toDouble: "$amount" }} } }
    ]);
 
     // Step 6: Failed & Pending PayOut Transactions
     const failedPayOut = await PayOut.aggregate([
        { $match: { status: "Failed" } },
        { $group: { _id: "$userId", totalFailedPayOut: { $sum: {$toDouble: "$amount" } } } }
    ]);
 
    // Converting results into maps for lookup
    const payInMap = {};
    payInData.forEach(item => payInMap[item._id.toString()] = item.totalPayIn || 0);
 
    const payOutMap = {};
    payOutData.forEach(item => payOutMap[item._id.toString()] = item.totalPayOut || 0);
 
    const pendingPayInMap = {};
    pendingPayIn.forEach(item => pendingPayInMap[item._id.toString()] = item.totalPendingPayIn || 0);
 
    const failedPayInMap = {};
    failedPayIn.forEach(item => failedPayInMap[item._id.toString()] = item.totalFailedPayIn || 0);
 
    const pendingPayOutMap = {};
    pendingPayOut.forEach(item => pendingPayOutMap[item._id.toString()] = item.totalPendingPayOut || 0);
 
    const failedPayOutMap = {};
    failedPayOut.forEach(item => failedPayOutMap[item._id.toString()] = item.totalPendingPayOut || 0);
 
      // Step 4: Fetch all users
      const users = await User.find({}, "name email mobileNumber role");
    //   const users = await User.findOne({email});
      // Step 5: Attach total pay-in, total pay-out, and available balance
      const finalData = users.map(user => {
        const totalPayIn = payInMap[user._id.toString()] || 0;
        const totalPayOut = payOutMap[user._id.toString()] || 0;
        const pendingPayInTotal = pendingPayInMap[user._id.toString()] || 0;
        const failedPayInTotal = failedPayInMap[user._id.toString()] || 0;
        const pendingPayOutTotal = pendingPayOutMap[user._id.toString()] || 0;
        const failedPayOutTotal = failedPayOutMap[user._id.toString()] || 0;
        const availableBalance = totalPayIn - totalPayOut;
 
          return {
            _id: user._id,
            name: user.name,
            email: user.email,
            mobileNumber: user.mobileNumber,
            role: user.role,
            totalPayIn,
            totalPayOut,
            pendingPayInTotal,
            failedPayInTotal,
            pendingPayOutTotal,
            failedPayOutTotal,
            availableBalance
          };
      });
 
      // Step 9: Calculate the totals across all users
    const totalSummary = finalData.reduce((totals, user) => {
        totals.totalPayIn += user.totalPayIn;
        totals.totalPayOut += user.totalPayOut;
        totals.totalPendingPayIn += user.pendingPayInTotal;
        totals.totalFailedPayIn += user.failedPayInTotal;
        totals.totalPendingPayOut += user.pendingPayOutTotal;
        totals.totalFailedPayOut += user.failedPayOutTotal;
        totals.totalAvailableBalance += user.availableBalance;
        return totals;
      }, {
        totalPayIn: 0,
        totalPayOut: 0,
        totalPendingPayIn: 0,
        totalFailedPayIn: 0,
        totalPendingPayOut: 0,
        totalFailedPayOut: 0,
        totalAvailableBalance: 0
      });
 
      // Return both the individual data and the total summary
      return {
        finalData,
        totalSummary
      };
 
  } catch (error) {
      console.error("Error in payingwalletreport API:", error);
      return error.message;
  }
}
 
module.exports = {userWallet, allUserWallet}