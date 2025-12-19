require("dotenv").config();
const crypto = require("crypto");
const qs = require("qs");
const User = require("../models/userModel.js");
const mongoose = require("mongoose");
const PayIn = require("../models/payInModel.js");
const axios = require("axios");
const { parse } = require("json2csv");
const Transaction = require("../models/transactionModel.js");
const payInModel = require("../models/payInModel.js");
const servicesModal = require("../models/servicesModal.js");
const { logApiCall } = require("../utils/chargeCaluate.js");


const merchant_identifier = process.env.ZAAKPAY_MERCHANT_CODE || "b19e8f103bce406cbd3476431b6b7973"
const secretKey = process.env.ZAAKPAY_SECRET_KEY || "0678056d96914a8583fb518caf42828a";


function generateZaakpayChecksum(params, secretKey, type) {

  if (type) {
    const filteredParams = Object.keys(params)
      .filter((key) => params[key] !== null && params[key] !== undefined && params[key] !== "")
      .sort() // ⿢ Sort alphabetically
      .map((key) => `${key}=${params[key]}`)
      .join("&") + "&"; // ⿤ Append & at end

    console.log("✅ String used for checksum:", filteredParams);
    // ⿥ Generate HMAC SHA256
    const checksum = crypto
      .createHmac("sha256", secretKey)
      .update(filteredParams)
      .digest("hex");

    console.log("✅ Generated Checksum:", checksum);
    return checksum;

  } else {
    const dataString = JSON.stringify(params);

    console.log("🔥 Checksum Raw String:", dataString);

    const checksum = crypto
      .createHmac("sha256", secretKey)
      .update(dataString)
      .digest("hex");

    console.log("🔥 Generated Checksum:", checksum);

    return checksum;
  }

}





exports.allPayin = async (req, res, next) => {
  try {
    const {
      keyword,
      status,
      fromDate,
      toDate,
      searchText,
      page = 1,
      limit = 10,
      exportCsv = "false",
    } = req.query;

    const match = {};
    const userId = req.user.role == "Admin" ? req.query.userId : req.user?.id;
    if (userId) match.userId = new mongoose.Types.ObjectId(userId);
    if (status) match.status = status;
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) match.createdAt.$lte = new Date(toDate);
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (searchText) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchText, $options: "i" } },
            { email: { $regex: searchText, $options: "i" } },
            { mobile: parseInt(searchText) || -1 },
            { amount: parseInt(searchText) || -1 },
            { utr: { $regex: searchText, $options: "i" } },
            { reference: { $regex: searchText, $options: "i" } },
            { "user.UserId": { $regex: searchText, $options: "i" } },
            { "user.name": { $regex: searchText, $options: "i" } },
            { "user.email": { $regex: searchText, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: "$user.name",
          userEmail: "$user.email",
          UserId: "$user.UserId",
          name: 1,
          email: 1,
          mobile: 1,
          amount: 1,
          afterAmount: 1,
          charges: 1,
          reference: 1,
          utr: 1,
          status: 1,
          remark: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } }
    );

    if (exportCsv !== "true") {
      pipeline.push(
        { $skip: (page - 1) * parseInt(limit) },
        { $limit: parseInt(limit) }
      );
    }

    const payIns = await PayIn.aggregate(pipeline);

    if (exportCsv === "true") {
      const fields = [
        "_id",
        "userId",
        "userName",
        "userEmail",
        "userUniqueId",
        "name",
        "email",
        "mobile",
        "amount",
        "afterAmount",
        "charges",
        "reference",
        "utr",
        "status",
        "remark",
        "createdAt",
      ];
      const csv = parse(payIns, { fields });
      res.header("Content-Type", "text/csv");
      res.header("Content-Disposition", "attachment; filename=payins.csv");
      return res.send(csv);
    }

    // total count ke liye
    const totalPipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];
    if (searchText) {
      totalPipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchText, $options: "i" } },
            { email: { $regex: searchText, $options: "i" } },
            { mobile: parseInt(searchText) || -1 },
            { amount: parseInt(searchText) || -1 },
            { utr: { $regex: searchText, $options: "i" } },
            { reference: { $regex: searchText, $options: "i" } },
            { "user.UserId": { $regex: searchText, $options: "i" } },
            { "user.name": { $regex: searchText, $options: "i" } },
            { "user.email": { $regex: searchText, $options: "i" } },
          ],
        },
      });
    }
    totalPipeline.push({ $count: "total" });

    const totalResult = await PayIn.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      data: payIns,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.createPayIn = async (req, res, next) => {
  try {
    const {
      userId,
      amount,
      reference,
      name,
      mobile,
      email,
      utr,
      remark,
      charges,
    } = req.body;

    if (!userId || amount == null || !reference || !name || !mobile || !email) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const payIn = await PayIn.create({
      userId,
      amount,
      reference,
      name,
      mobile,
      email,
      utr,
      remark,
      charges,
      status: "Pending",
      adminAction: "Pending",
    });

    res.status(201).json({ success: true, data: payIn });
  } catch (error) {
    next(error);
  }
};


// zacapay
exports.generatePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionCompleted = false;

  try {

    // const tokenResponse = await axios.post(
    //   "https://admin.finuniques.in/api/v1.1/t1/oauth/token",

    //   new URLSearchParams({
    //     authKey: "UTI6tamscw",
    //     authSecret: "4jtudpz0ri1x2t@y",
    //   }),
    //   {
    //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //   }
    // );

    // const accessToken = tokenResponse?.data?.data?.access_token;

    // if (!accessToken) {
    //   return res
    //     .status(400)
    //     .json({ success: false, message: "Failed to fetch token" });
    // }

    const { userId, amount, category = "69098858833bc4bd990d6e22", reference, name, mobile, email } = req.body;

    if (!amount || !email) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (amount < 0 || amount > 100000) {
      return res.status(400).json({
        success: false,
        message: "Amount must be between 0 and 100000",
      });
    }


    const user = await User.findOne({
      _id: req?.user?.id || userId,
      status: true,
    }).session(session);

    const service = await servicesModal.findOne({ _id: category });
    if (!service) {
      return res.status(400).json({ success: false, message: "Service not found" });
    }

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "User not found or inactive" });
    }


    const referenceId = `ZAAK${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    const [transaction] = await Transaction.create(
      [
        {
          user_id: user._id,
          transaction_type: "credit",
          amount: Number(amount),
          type: service._id,
          balance_after: user.eWallet,
          payment_mode: "wallet",
          transaction_reference_id: reference || referenceId,
          description: `PayIn initiated for ${user.name}`,
          status: "Pending",
        },
      ],
      { session }
    );

    const [payIn] = await PayIn.create(
      [
        {
          userId: user._id,
          fromUser: user._id,
          mobile: user.mobileNumber,
          email: user.email,
          reference: reference || referenceId,
          name: user.name,
          source: "PayIn",
          amount: Number(amount),
          type: service._id,
          charges: 0,
          remark: "Payment Pending",
          status: "Pending",
        },
      ],
      { session }
    );

    // 🔹 Prepare Zaakpay payload
    const payloadUpi = {
      merchantIdentifier: merchant_identifier,
      showMobile: "true",
      mode: "0",
      returnUrl: "https://server.finuniques.in/api/v1/payment/payin/callback",
      orderDetail: {
        orderId: reference || referenceId,
        amount: (amount * 100).toString(),
        currency: "INR",
        productDescription: "Wallet Topup",
        email: email,
      },
      paymentInstrument: {
        paymentMode: "UPIAPP",
        netbanking: { bankid: "" }
      }
    };

    const payloadEx = {
      amount: (amount * 100).toString(),
      buyerEmail: email,
      currency: "INR",
      merchantIdentifier: merchant_identifier,
      orderId: reference || referenceId,
      returnUrl: "https://server.finuniques.in/api/v1/payment/payin/callback"
      // returnUrl: "https://gkns438l-8080.inc1.devtunnels.ms/api/v1/payment/payin/callback"
    };


    const checksumUpi = generateZaakpayChecksum(payloadUpi, secretKey, false);
    const checksumEx = generateZaakpayChecksum(payloadEx, secretKey, true);

    // Final request
    const responseUpi = await axios.post(
      "https://api.zaakpay.com/transactU?v=8",
      qs.stringify({
        data: JSON.stringify(payloadUpi),
        checksum: checksumUpi
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const payload2 = {
      ...payloadEx, checksum: checksumEx
    }
    const responseEx = `https://api.zaakpay.com/api/paymentTransact/V8?${qs.stringify(payload2)}`;


    console.log(responseUpi.data);
    payIn.remark = "Redirect to Zaakpay for payment";
    transaction.description = "Redirect to Zaakpay for payment";

    await user.save({ session });
    await payIn.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    transactionCompleted = true;

    logApiCall({ url: "/payin", requestData: { payloadUpi, payloadEx }, responseData: { resUpi: responseUpi.data, resEx: `https://api.zaakpay.com/api/paymentTransact/V8?${qs.stringify(payload2)}` } });
    return res.status(200).json({
      success: true,
      message: "PayIn initiated. Redirect user to complete payment.",
      data: {
        redirectURL: responseUpi.data.bankPostData.androidIntentUrl,
        redirectEx: responseEx
      }
    });
  } catch (error) {
    if (!transactionCompleted) {
      await session.abortTransaction();
    }
    console.error("❌ PayIn Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while processing payment",
    });
  } finally {
    session.endSession();
  }
};


// finunique
// exports.generatePayment = async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const tokenResponse = await axios.post(
//       "https://admin.finuniques.in/api/v1.1/t1/oauth/token",
//       new URLSearchParams({
//         authKey: "UTI6tamscw",
//         authSecret: "4jtudpz0ri1x2t@y",
//       }),
//       {
//         headers: { "Content-Type": "application/x-www-form-urlencoded" },
//       }
//     );

//     const accessToken = tokenResponse?.data?.data?.access_token;

//     if (!accessToken) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Failed to fetch token" });
//     }
//     const { userId, amount, category, reference, name, mobile, email } = req.body;

//     if (!amount || !reference || !name || !mobile || !email) {
//       return res.status(400).json({
//         success: false,
//         message: "All fields are required",
//       });
//     }

//     const user = await User.findOne({
//       _id: req?.user?.id || userId,
//       status: true,
//     }).session(session);

//     const service = await servicesModal.findOne({ _id: category });
//     if (!service) {
//       return res.status(400).json({ success: false, message: "Service not found" });
//     }

//     if (!user) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ success: false, message: "User not found or inactive" });
//     }

//     const referenceId = `PAY${Date.now()}`;

//     const [transaction] = await Transaction.create(
//       [
//         {
//           user_id: user._id,
//           transaction_type: "credit",
//           amount: Number(amount),
//           type: service._id,
//           balance_after: user.eWallet,
//           payment_mode: "wallet",
//           transaction_reference_id: referenceId,
//           description: `PayIn initiated for ${user.name}`,
//           status: "Pending",
//         },
//       ],
//       { session }
//     );

//     const [payIn] = await PayIn.create(
//       [
//         {
//           userId: user._id,
//           fromUser: user._id,
//           mobile: user.mobileNumber,
//           email: user.email,
//           reference: referenceId,
//           name: user.name,
//           source: "PayIn",
//           amount: Number(amount),
//           type: service._id,
//           charges: 0,
//           remark: "Payment Pending",
//           status: "Pending",
//         },
//       ],
//       { session }
//     );


//     let response;
//     try {
//       response = await axios.post(
//         "https://admin.finuniques.in/api/v1.1/t1/UpiIntent",
//         { amount, reference, name, email, mobile },
//         {
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${accessToken}`,
//           },
//         }
//       );
//       console.log(response);

//     } catch (apiError) {

//       response = { status: 500, data: { success: false, message: apiError.response.data.message } };
//     }

//     // 🔹 Check API response and decide outcome
//     if (response.status !== 200 || !response.data?.success == 'success') {
//       // ❌ Mark as Failed and save before exiting
//       payIn.status = "Failed";
//       transaction.status = "Failed";
//       payIn.remark = response.data?.message || "UPI Intent creation failed";
//       transaction.description = response.data?.message || "UPI Intent creation failed";

//       await payIn.save({ session });
//       await transaction.save({ session });

//       await session.commitTransaction();
//       session.endSession();

//       return res.status(400).json({
//         success: false,
//         message: payIn.remark,
//       });
//     }

//     // ✅ Success flow
//     payIn.status = "Success";
//     transaction.status = "Success";
//     payIn.remark = response.data?.message || "Payment Successfully add!";
//     transaction.description = response.data?.message || "Payment Successfully add!";
//     user.eWallet = Number(user.eWallet) + Number(amount);

//     await user.save({ session });
//     await payIn.save({ session });
//     await transaction.save({ session });

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(200).json({
//       success: true,
//       message: "PayIn successful and wallet updated",
//       data: {
//         paymentIntent: response.data,
//         updatedBalance: user.eWallet,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("❌ PayIn Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Something went wrong while processing payment",
//     });
//   }
// };

exports.callbackPayIn = async (req, res) => {
  try {

    let data;

    if (req.body.txnData) {
      try {
        const txnData =
          typeof req.body.txnData === "string"
            ? JSON.parse(req.body.txnData)
            : req.body.txnData;

        data = txnData.txns ? txnData.txns[0] : txnData;

        console.log("📌 Custom Checkout Data Parsed:", data);

      } catch (err) {
        console.error("❌ JSON Parse Error:", err);
        return res.status(400).json({ success: false, message: "Invalid JSON received from ZaakPay" });
      }
    }
    else {
      data = req.body;
      console.log("📌 Hosted Checkout Data:", data);
    }

    console.log("callback data", data);
    logApiCall({ url: "/callback", requestData: "", responseData: data });
    const responseCode = data?.responseCode?.toString();
    const isSuccess = responseCode == "100";




    // const response = await axios.post("https://instantpayco.com/api/bbpszackpaypayin", data, {
    //   headers: { "Content-Type": "application/json" }
    // });
    // console.log("Callback sent to merchant successfully");


    // 🧾 Update PayIn record
    const payIn = await PayIn.findOneAndUpdate(
      {
        reference: data?.orderId,
        status: { $ne: "Success" }
      },
      {
        $set: {
          status: isSuccess ? "Success" : "Failed",
          responseDescription: data?.responseDescription,
          pgTransId: data?.pgTransId,
          paymentMode: data?.paymentMode,
          bank: data?.bank,
          remark: data?.responseDescription,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );
    console.log("payIn found", payIn);

    if (!payIn) {
      return res.status(404).send("Invalid callback reference");
    }

    // 👤 Find the related user
    let user = null;
    if (isSuccess && payIn && payIn.userId) {
      const amount = Number(data?.amount) / 100 || 0;

      user = await User.findOneAndUpdate(
        { _id: payIn.userId },
        { $inc: { eWallet: amount } },
        { new: true }
      );
    } else {
      user = await User.findById(payIn.userId)
    }

    // 💳 Update Transaction report
    await Transaction.findOneAndUpdate(
      {
        transaction_reference_id: data?.orderId,
        status: { $ne: "Success" }
      },
      {
        $set: {
          status: isSuccess ? "Success" : "Failed",
          balance_after: user.eWallet,
          gatewayResponse: data,
          payment_mode: data?.paymentMode,
          description: data?.responseDescription,
          updatedAt: new Date(),
          "meta.apiResponse": data
        },
      },
      { new: true }
    )

    const successHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment Successful</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f6fffa; padding: 40px; color: #333; }
          .container { max-width: 500px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: center; padding: 30px; }
          .icon { font-size: 70px; color: #4CAF50; }
          h1 { color: #4CAF50; margin-top: 20px; }
          .details { text-align: left; margin-top: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 14px; }
          .footer { text-align: center; margin-top: 25px; font-size: 13px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Payment Successful</h1>
          <p>${data?.responseDescription || "Transaction completed successfully."}</p>
          <div class="details">
            <strong>Order ID:</strong> ${data?.orderId || "N/A"}<br/>
            <strong>Amount:</strong> ₹${(data?.amount / 100).toFixed(2) || "0"}<br/>
            <strong>Bank:</strong> ${data?.bank || "N/A"}<br/>
            <strong>Transaction ID:</strong> ${data?.pgTransId || "N/A"}<br/>
            <strong>Payment Mode:</strong> ${data?.paymentMode || "N/A"}<br/>
            <strong>Time:</strong> ${data?.pgTransTime || "N/A"}<br/>
          </div>
          <div class="footer">© ${new Date().getFullYear()} FINUNIQUE SMALL PRIVATE LIMITED</div>
        </div>
      </body>
      </html>
    `;

    const failureHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment Failed</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #fff6f6; padding: 40px; color: #333; }
          .container { max-width: 500px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: center; padding: 30px; }
          .icon { font-size: 70px; color: #f44336; }
          h1 { color: #f44336; margin-top: 20px; }
          .details { text-align: left; margin-top: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 14px; }
          .footer { text-align: center; margin-top: 25px; font-size: 13px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Payment Failed</h1>
          <p>${data?.responseDescription || "Transaction failed. Please try again."}</p>
          <div class="details">
            <strong>Order ID:</strong> ${data?.orderId || "N/A"}<br/>
            <strong>Amount:</strong> ₹${(data?.amount / 100).toFixed(2) || "0"}<br/>
            <strong>Bank:</strong> ${data?.bank || "N/A"}<br/>
            <strong>Transaction ID:</strong> ${data?.pgTransId || "N/A"}<br/>
            <strong>Payment Mode:</strong> ${data?.paymentMode || "N/A"}<br/>
            <strong>Time:</strong> ${data?.pgTransTime || "N/A"}<br/>
          </div>
          <div class="footer">© ${new Date().getFullYear()} FINUNIQUE SMALL PRIVATE LIMITED </div>
        </div>
      </body>
      </html>
    `;

    if (user && user.callbackUrl) {
      try {
        const response = await axios.post(user.callbackUrl, data, {
          headers: { "Content-Type": "application/json" }
        });
        console.log("Callback sent to merchant successfully");

        return res.status(200).send(isSuccess ? successHTML : failureHTML);

      } catch (callbackErr) {
        console.error("⚠️ Error sending callback to user:", callbackErr);
        return res.status(200).send(isSuccess ? successHTML : failureHTML);
      }
    } else {

      return res.status(200).send(isSuccess ? successHTML : failureHTML);
    }
  } catch (error) {
    console.error("🔥 Error in callback handler:", error.message);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 40px;">
          <h1>500 - Internal Server Error</h1>
          <p>${error.message}</p> 
        </body>
      </html>
    `);
  }
};

exports.callbackGet = async (req, res) => {
  try {
    const data = req.body
    console.log("callback response........................", data);
    return res.json({
      success: true,
      message: "Callback Send",
    });

  } catch (error) {
    console.error("🔥 Error in callback handler:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while processing payment",
    });

  }
};




exports.checkPayInStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res
        .status(400)
        .json({ success: false, message: "Reference ID is required" });
    }

    const payin = await PayIn.findOne(
      { reference },
      {
        _id: 0,
        reference: 1,
        status: 1,
        utr: 1,
        amount: 1,
        remark: 1,
        createdAt: 1,
      }
    );

    if (!payin) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...payin.toObject(),
        timestamp: payin.createdAt,
      },
    });
  } catch (error) {
    console.error("Error checking PayIn status:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
