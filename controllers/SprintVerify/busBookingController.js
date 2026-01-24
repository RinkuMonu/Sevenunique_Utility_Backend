require("dotenv").config();
const axios = require("axios");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const { startSession } = require("mongoose");
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const bbpsModel = require("../../models/bbpsModel");
const {
  getApplicableServiceCharge,
  applyServiceCharges,
  logApiCall,
  calculateCommissionFromSlabs,
  generateRandomCashback,
} = require("../../utils/chargeCaluate");

function getPaysprintHeaders() {
  return {
    Token: generatePaysprintJWT(),
    Authorisedkey: process.env.PAYSPRINT_AUTH_KEY,
  };
}






const generateReferenceId = () => {
  const timestamp = Date.now().toString(36); // Short base36 timestamp
  const randomStr = Math.random().toString(36).substring(2, 8); // Random string
  return `REF${timestamp}${randomStr}`.toUpperCase();
};

const handleApiError = (error) => ({
  status: "error",
  message: error.response?.data?.message || "API request failed",
  error: error.message,
  details: error.response?.data || null,
});

const handleResponse = (res, data, successMessage) => {
  console.log(data);

  if (data.response_code === 1) {
    return res.status(200).json({
      status: "success",
      message: successMessage,
      data: data.data,
    });
  }
  return res.status(400).json({
    ...data,
    status: "fail",
    message: data.message || "Operation failed",
  });
};

const getSourceCities = async (req, res, next) => {
  const headers = getPaysprintHeaders();

  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/source",
      {},
      { headers }
    );
    // logApiCall({
    //   tag: "/bus/ticket/source",
    //   requestData: req.body,
    // });
    handleResponse(res, response.data, "Source cities fetched successfully");
  } catch (error) {
    console.log("Error in getSourceCities:", error);
    next(error);
  }
};

const getAvailableTrips = async (req, res) => {
  const headers = getPaysprintHeaders();
  const { source_id, destination_id, date_of_journey } = req.body;
  if (!source_id || !destination_id || !date_of_journey) {
    res
      .status(400)
      .json({ status: "failed", message: "all field are required" });
  }
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/availabletrips",
      { source_id, destination_id, date_of_journey },
      { headers }
    );
    console.log(
      "Available trips response:",
      source_id,
      destination_id,
      date_of_journey
    );

    logApiCall({
      tag: "bus/ticket/availabletrips",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(res, response.data, "Available trips fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getTripDetails = async (req, res) => {
  const { trip_id } = req.body;
  try {
    const headers = getPaysprintHeaders();
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/tripdetails",
      { trip_id },
      { headers }
    );
    logApiCall({
      tag: "/bus/ticket/tripdetails",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(res, response.data, "Trip details fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getBoardingPointDetail = async (req, res) => {
  const { bpId, trip_id } = req.body;
  try {
    const headers = getPaysprintHeaders();
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/boardingPoint",
      { bpId, trip_id },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/boardingPoint",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(
      res,
      response.data,
      "Boarding point details fetched successfully"
    );
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const blockTicket = async (req, res) => {
  const requiredFields = [
    "availableTripId",
    "boardingPointId",
    "droppingPointId",
    "source",
    "destination",
    "inventoryItems",
    "bookingType",
    "paymentMode",
    "serviceCharge",
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      return res.status(400).json({
        status: "failed",
        message: `${field} is required`,
      });
    }
  }

  try {
    const headers = getPaysprintHeaders();
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/blockticket",
      req.body,
      { headers }
    );
    console.log("Block ticket response:", req.body);
    logApiCall({
      tag: "bus/ticket/blockticket",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(res, response.data, "Ticket blocked successfully");
  } catch (error) {
    console.log("Error in blockTicket:", error);
    return res.status(500).json(handleApiError(error));
  }
};

const bookTicket = async (req, res) => {
  const session = await startSession();
  session.startTransaction();
  try {
    const headers = getPaysprintHeaders();

    const userId = req.user.id;
    const { amount, passenger_phone, passenger_email, refid, mpin, base_fare, blockKey, category = "68c936fc8fa1dda33eb541c2" } =
      req.body;
    const { commissions, service } = await getApplicableServiceCharge(
      userId,
      category
    );
    let commission = commissions?.slabs?.length
      ? calculateCommissionFromSlabs(amount, commissions)
      : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };


    const user = await userModel
      .findOne({ _id: userId })
      .session(session)
      .exec();
    if (user.mpin != mpin) {
      throw new Error("Invalid mpin ! Please enter a vaild mpin");
    }

    const usableBalance = user.eWallet - (user.cappingMoney || 0);
    const retailerBenefit = user.role === "User" ? 0 : Number(commission.retailer || 0);
    const required = Number((
      Number(amount) +
      Number(commission.charge || 0) +
      Number(commission.gst || 0) + Number(commission.tds || 0) - Number(retailerBenefit || 0)
    ).toFixed(2));

    if (usableBalance < required) {
      return res.status(400).json({
        error: true,
        message: `Insufficient wallet balance. You must maintain ₹${user.cappingMoney} in your wallet. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`
      });

    }

    const updateUser = await userModel.findByIdAndUpdate(
      userId,
      { $inc: { eWallet: -required } },
      { new: true, session }
    );

    const debitTxn = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: Number(amount),
      type: service._id,
      gst: Number(commission.gst),
      tds: Number(commission.tds),
      charge: Number(commission.charge),
      totalDebit: Number(required),
      totalCredit: user.role === "User" ? 0 : Number(commission.retailer || 0),
      balance_after: updateUser.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: refid,
      description: `Bus ticket booking initiated with referenceId ${refid}`,
      status: "Pending",
      provider: "paySprint",
    }], { session });

    const bookingRecord = await bbpsModel.create([{
      userId,
      rechargeType: service?._id,
      operator: "Bus Booking" || operatorName,
      customerNumber: passenger_phone,
      amount: Number(amount),

      charges: Number(commission.charge || 0),

      retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

      distributorCommission: Number(commission.distributor || 0),

      adminCommission: Number(commission.admin || 0),

      gst: Number(commission.gst || 0),
      tds: Number(commission.tds || 0),
      totalCommission: Number(commission.totalCommission || 0),
      totalDebit: Number(required),

      transactionId: refid,
      extraDetails: { mobileNumber: passenger_phone, email: passenger_email, blockKey },
      status: "Pending",
      provider: "paySprint",
    }], { session });

    const payload = {
      amount,
      base_fare,
      blockKey,
      passenger_phone,
      passenger_email,
      refid
    }
    console.log(payload);


    const paysprintRes = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/bookticket",
      payload,
      { headers }
    );
    console.log(paysprintRes);


    logApiCall({
      tag: "bus/ticket/bookticket",
      requestData: req.body,
      responseData: paysprintRes.data,
    });

    const { response_code, message } = paysprintRes.data;
    let status = "Failed";

    if (response_code === 1) status = "Success";
    else if ([0, 2].includes(response_code)) status = "Pending";

    debitTxn[0].status = status;
    await debitTxn[0].save({ session });

    bookingRecord[0].status = status;
    await bookingRecord[0].save({ session });


    if (status === "Failed") {
      const refundedUser = await userModel.findByIdAndUpdate(
        userId,
        { $inc: { eWallet: required } },
        { new: true, session, runValidators: true }
      );


      debitTxn[0].balance_after = refundedUser.eWallet;
      await debitTxn[0].save({ session });

      bookingRecord[0].status = status;
      await bookingRecord[0].save({ session });
    }
    if (status === "Success") {
      const newPayOut = new PayOut({
        userId,
        amount: Number(amount),
        reference: refid,
        type: service._id,
        trans_mode: "WALLET",
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: commission.charge || 0,
        gst: commission.gst || 0,
        tds: commission.tds || 0,
        totalDebit: required,
        remark: `Bus ticket booking with referenceId ${refid}`,
      });
      await newPayOut.save({ session });

      if (user.role === "User") {
        const retailerCommission = Number(commission.retailer || 0);

        if (retailerCommission > 0) {

          const cashbackAmount = generateRandomCashback(retailerCommission);

          if (cashbackAmount > 0) {
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1);

            await scratchCouponModel.findOneAndUpdate(
              { serviceTxnId: refid },
              {
                $setOnInsert: {
                  userId,
                  serviceTxnId: refid,
                  serviceName: "Bus Booking",
                  baseAmount: required,
                  cashbackAmount,
                  expiresAt: expiry,
                }
              },
              { upsert: true, session }
            );

          }
        }
      } else {
        await CommissionTransaction.create([{
          referenceId: refid,
          service: service._id,
          baseAmount: Number(amount),
          charge: Number(commission.charge),
          netAmount: Number(required),
          roles: [
            {
              userId,
              role: "Retailer",
              commission: commission.retailer || 0,
              chargeShare: Number(commission.charge) + Number(commission.gst) + Number(commission.tds) || 0,
            },
            { userId: user.distributorId, role: "Distributor", commission: commission.distributor || 0, chargeShare: 0 },
            { userId: process.env.ADMIN_USER_ID, role: "Admin", commission: commission.admin || 0, chargeShare: 0 }
          ],
          type: "credit",
          status: "Success",
          sourceRetailerId: userId,
          commissionDistributed: true,
        }], { session });

        console.log("💸 CommissionTransaction created for all roles");

        await distributeCommission({
          user: userId,
          distributer: user.distributorId,
          service: service,
          amount,
          commission,
          reference: refid,
          description: `Commission for Bus Booking of ${passenger_phone}`,
          session
        });
        console.log("💸 Commission distributed");
        if (status === "Success") {
          rechargeRecord[0].commissionDistributed = true;
          await rechargeRecord[0].save({ session });
        }

      }

    }

    await session.commitTransaction();
    session.endSession();

    return res.status(status === "Success" ? 200 : 400).json({
      status: status.toLowerCase(),
      message: message || `Ticket booking ${status.toLowerCase()}`,
      refid: refid,
      paysprintRes: paysprintRes.data
    });
  } catch (error) {
    console.log(error);

    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      status: "error",
      message: error.message,
      details: error.response?.data || null,
    });
  }
};

const checkBookedTicket = async (req, res) => {
  const { refid } = req.body;
  try {
    const headers = getPaysprintHeaders();

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/check_booked_ticket",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/check_booked_ticket",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(res, response.data, "Ticket details retrieved successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getTicketDetails = async (req, res) => {
  const { refid } = req.body;
  try {
    const headers = getPaysprintHeaders();

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/get_ticket",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/get_ticket",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(res, response.data, "Ticket retrieved successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getCancellationData = async (req, res) => {
  const { refid } = req.body;

  try {
    const headers = getPaysprintHeaders();

    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/get_cancellation_data",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/get_cancellation_data",
      requestData: req.body,
      responseData: response.data,
    });
    handleResponse(
      res,
      response.data,
      "Cancellation data fetched successfully"
    );
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const cancelTicket = async (req, res) => {
  const { refid, seatsToCancel } = req.body;

  const session = await startSession();
  session.startTransaction();

  try {
    const headers = getPaysprintHeaders();

    // First check if the ticket exists in our system
    const booking = await booking.findOne({ refid }).session(session);
    if (!booking) {
      throw new Error("Booking not found");
    }

    // Process cancellation with Paysprint
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/cancel_ticket",
      { refid, seatsToCancel },
      { headers }
    );

    logApiCall({
      tag: "bus/ticket/cancel_ticket",
      requestData: req.body,
      responseData: response.data,
    });

    if (response.data.response_code !== 1) {
      throw new Error(response.data.message || "Cancellation failed");
    }

    if (!refundResult.success) {
      throw new Error(refundResult.message || "Refund processing failed");
    }
    booking.status = "cancelled";
    booking.cancellationDate = new Date();
    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    handleResponse(res, response.data, "Ticket cancelled successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      status: "error",
      message: error.message,
      details: error.response?.data || null,
    });
  }
};
const paysprintCallback = async (req, res) => {
  const data = req.body;
  const event = data.event;
  const param = data.param;
  const category = "68c936fc8fa1dda33eb541c2";

  console.log("📢 Paysprint Callback Event:", event);
  console.log("📢 Paysprint Callback data:", data);

  const session = await startSession();
  session.startTransaction();

  try {
    const decoded = JSON.parse(
      Buffer.from(param.refid, "base64").toString("utf8")
    )
    console.log(decoded);
    // const userId = await getUserIdFromRefid(param.refid);
    const user = await userModel.findById(decoded.uid).session(session);

    if (!user) throw new Error("User not found");


    const { commissions, service } = await getApplicableServiceCharge(user._id, category);

    const commission = commissions?.slabs?.length
      ? calculateCommissionFromSlabs(param.amount, commissions)
      : { charge: 0, gst: 0, tds: 0, retailer: 0, distributor: 0, admin: 0 };

    const required =
      Number(param.total_deduction) +
      commission.charge +
      commission.gst +
      commission.tds -
      commission.retailer;

    const debitAmount = Number(required.toFixed(2));
    const usableBalance = user.eWallet - (user.cappingMoney || 0);

    if (usableBalance < required) {
      throw new Error(`Insufficient wallet balance. Maintain ₹${user.cappingMoney}. Available: ₹${user.eWallet}, Required: ₹${required + user.cappingMoney}`);
    }

    const updatedUser = await userModel.findOneAndUpdate(
      {
        _id: user._id,
        eWallet: { $gte: required }
      },
      {
        $inc: { eWallet: -required }
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!updatedUser) {
      throw new Error(`Insufficient balance. Required: ₹${debitAmount}, Available: ₹${user.eWallet}`);
    }


    // Debit (booking deduction)
    if (event === "BUS_TICKET_BOOKING_DEBIT_CONFIRMATION") {
      console.log("💸 Debit confirmation callback");


      await Transaction.create(
        [
          {
            user_id: user._id,
            transaction_type: "debit",
            amount: required,
            type: service?._id || category,
            gst: commission.gst,
            tds: commission.tds,
            charge: commission.charge,
            totalDebit: required,
            totalCredit: commission.retailer,
            balance_after: updatedUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: param.refid,
            description: `Bus ticket booking debit confirmed for blockId ${param.blockKey}`,
            status: "Success",
            provider: "paySprint",
          },
        ],
        { session }
      );

      await bbpsModel.create([{
        userId: user._id,
        rechargeType: service?._id,
        operator: "Generate Url",
        customerNumber: user.mobileNumber,
        amount: Number(param.amount),

        charges: Number(commission.charge || 0),

        retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

        distributorCommission: Number(commission.distributor || 0),

        adminCommission: Number(commission.admin || 0),

        gst: Number(commission.gst || 0),
        tds: Number(commission.tds || 0),
        totalCommission: Number(commission.totalCommission || 0),
        totalDebit: Number(required),

        transactionId: param.refid,
        extraDetails: { res: data },
        status: "Success",
        provider: "paySprint",
      }], { session });
    }

    // Credit (booking cancellation refund)
    else if (event === "BUS_TICKET_BOOKING_CREDIT_CONFIRMATION") {
      console.log("💰 Credit confirmation callback");
      const updatedUser = await userModel.findOneAndUpdate(
        {
          _id: user._id,
          eWallet: { $gte: required }
        },
        {
          $inc: { eWallet: +required }
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      await Transaction.create(
        [
          {
            user_id: user._id,
            transaction_type: "credit",
            amount: required,
            type: service?._id || category,
            gst: commission.gst,
            tds: commission.tds,
            charge: commission.charge,
            totalDebit: required,
            totalCredit: commission.retailer,
            balance_after: updatedUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: param.refid,
            description: `Bus ticket booking credit confirmed for blockId ${param.blockKey}`,
            status: "Refunded",
            provider: "paySprint",
            meta: {
              res: data
            },
          },
        ],
        { session }
      );

      await bbpsModel.create([{
        userId: user._id,
        rechargeType: service?._id,
        operator: "Generate Url",
        customerNumber: user.mobileNumber,
        amount: Number(param.amount),

        charges: Number(commission.charge || 0),

        retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

        distributorCommission: Number(commission.distributor || 0),

        adminCommission: Number(commission.admin || 0),

        gst: Number(commission.gst || 0),
        tds: Number(commission.tds || 0),
        totalCommission: Number(commission.totalCommission || 0),
        totalDebit: Number(required),

        transactionId: param.refid,
        extraDetails: { res: data },
        status: "Refunded",
        provider: "paySprint",
      }], { session });
    }

    // Ticket Confirmation (final booking success)
    else if (event === "BUS_TICKET_BOOKING_CONFIRMATION") {
      console.log("🎟️ Ticket final confirmation callback");

      await Transaction.create(
        [
          {
            user_id: user._id,
            transaction_type: "debit",
            amount: required,
            type: service?._id || category,
            gst: commission.gst,
            tds: commission.tds,
            charge: commission.charge,
            totalDebit: required,
            totalCredit: commission.retailer,
            balance_after: updatedUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: param.refid,
            description: `Bus ticket booking debit confirmed for blockId ${param.blockKey}`,
            status: "Success",
            provider: "paySprint",
            meta: {
              res: data
            },
          },
        ],
        { session }
      );

      await bbpsModel.create([{
        userId: user._id,
        rechargeType: service?._id,
        operator: "Generate Url",
        customerNumber: user.mobileNumber,
        amount: Number(param.amount),

        charges: Number(commission.charge || 0),

        retailerCommission: user.role === "User" ? 0 : Number(commission.retailer || 0),

        distributorCommission: Number(commission.distributor || 0),

        adminCommission: Number(commission.admin || 0),

        gst: Number(commission.gst || 0),
        tds: Number(commission.tds || 0),
        totalCommission: Number(commission.totalCommission || 0),
        totalDebit: Number(required),

        transactionId: param.refid,
        extraDetails: { res: data },
        status: "Success",
        provider: "paySprint",
      }], { session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 200,
      message: "Transaction completed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Callback error:", error.message);
    return res.status(400).json({
      status: 400,
      message: "Transaction failed",
    });
  }
};

///*********** */
// routes/bus.js
// POST /api/bus/generate-url
function generatePaysprintJWTDirect() {
  const timestamp = Math.floor(Date.now() / 1000);
  const secretKey = process.env.PAYSPRINT_JWT_SECRET_P;
  const payload = {
    timestamp: timestamp,
    partnerId: process.env.PAYSPRINT_PARTNER_ID,
    reqid: timestamp,
    product: "BUS"
  };
  return jwt.sign(payload, secretKey, { algorithm: "HS256" });
}
function getPaysprintHeadersDirect() {
  return {
    Token: generatePaysprintJWTDirect(),
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorisedkey: process.env.PAYSPRINT_AUTH_KEY_P,
  };
}


const busbookingDirectUrl = async (req, res) => {
  try {
    const uniqueId = {
      uid: req.user.id.toString(),
      timestamp: `BS${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`
    };

    const encoded = Buffer.from(JSON.stringify(uniqueId)).toString("base64");

    const refid = encoded;

    if (!refid) {
      return res.status(400).json({
        success: false,
        message: "refid is required",
      });
    }
    console.log(refid)
    const headers = getPaysprintHeadersDirect()
    console.log("generatePaysprintJWT>>>>>>", headers)
    // return;

    const PAYSPRINT_GENERATE_URL =
      "https://api.paysprint.in/api/v1/service/bus/generateurl";

    const redirect_url = "https://server.finuniques.in/api/v1/s3/callback";
    // const redirect_url = "https://vmm9pgj8-8080.inc1.devtunnels.ms/api/v1/s3/callback";

    const psResponse = await axios.post(
      PAYSPRINT_GENERATE_URL,
      {
        refid,
        redirect_url,
      },
      {
        headers: headers,
      }
    );


    // assume response.data me encdata & url hai
    console.log("Paysprint Response:", psResponse.data);
    const lastres = psResponse.data || {};
    logApiCall({
      url: "/v1/s3/generate-url",
      requestData: {
        refid,
        redirect_url,
      },
      responseData: lastres,
    });

    if (!(lastres.status === true && lastres.response_code === 1)) {
      return res.status(403).json({
        success: false,
        message: "Invalid response from Service's",
        data: psResponse.data,
      });
    }

    // Frontend ko bhej do
    return res.json({
      success: true,
      data: lastres ? lastres.data : null,
      refid: refid,
      message: lastres ? lastres.message : "Data Successfully Generated"
    });
  } catch (err) {
    console.error("Error in generate-url:", err.response);
    return res.status(500).json({
      success: false,
      message: "Failed to generate bus url",
      error: err.response?.data || err.message,
    });
  }
}

// routes/bus.js me hi
const jwt = require("jsonwebtoken");
const scratchCouponModel = require("../../models/scratchCoupon.model");
const CommissionTransaction = require("../../models/CommissionTransaction");
const { distributeCommission } = require("../../utils/distributerCommission");

// POST /api/bus/callback
const busbookingDirectUrlCallback = async (req, res) => {
  try {
    console.log("bus booking response", req)
    const encryptedData = req.body;

    if (!encryptedData) {
      return res.status(400).json({ success: false, message: "No data received" });
    }

    console.log("Encrypted Callback Data:", encryptedData);
    logApiCall({
      tag: "/bus/ticket/callback",
      requestData: encryptedData
    });


    // Store decrypted data in DB if required...

    return res.json({ status: 200, message: "Transaction completed successfully" });
  } catch (err) {
    console.error("Callback Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to decrypt callback data",
      error: err.message,
    });
  }
}





// Helper function to get userId from refid (dummy logic, modify as per your system)
// async function getUserIdFromRefid(refid) {
//   const booking = await bbpsModel.findOne({ transactionId: refid });
//   if (booking) return booking.userId;
//   throw new Error("Booking not found for provided refid");
// }

module.exports = {
  getSourceCities,
  getAvailableTrips,
  getTripDetails,
  getBoardingPointDetail,
  blockTicket,
  bookTicket,
  checkBookedTicket,
  getTicketDetails,
  getCancellationData,
  cancelTicket,
  paysprintCallback,
  busbookingDirectUrl,
  busbookingDirectUrlCallback
};
