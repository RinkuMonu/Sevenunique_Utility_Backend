const axios = require("axios");
const generatePaysprintJWT = require("../../services/Dmt&Aeps/TokenGenrate");
const { startSession } = require('mongoose');
const userModel = require("../../models/userModel");
const Transaction = require("../../models/transactionModel");
const bbpsModel = require("../../models/bbpsModel");
const { getApplicableServiceCharge, applyServiceCharges, logApiCall } = require("../../utils/chargeCaluate");

const headers = {
  Token: generatePaysprintJWT(),
  Authorisedkey: "MGY1MTVmNWM3Yjk5MTdlYTcyYjk5NmUzZjYwZDVjNWE=",
};

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
  if (data.response_code === 1) {
    return res.status(200).json({
      status: "success",
      message: successMessage,
      data: data.data
    });
  }
  return res.status(400).json({
    ...data,
    status: "fail",
    message: data.message || "Operation failed",
  });
};

const getSourceCities = async (req, res, next) => {

  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/source",
      {},
      { headers }
    );
    // logApiCall({
    //   tag: "/bus/ticket/source",
    //   // requestData: req.body,
    //   responseData: response.data
    // });
    handleResponse(res, response.data, "Source cities fetched successfully");
  } catch (error) {

    console.log("Error in getSourceCities:", error);
    next(error);
  }
};

const getAvailableTrips = async (req, res) => {
  const { source_id, destination_id, date_of_journey } = req.body;
  if (!source_id || !destination_id || !date_of_journey) {
    res.status(400).json({ status: "failed", message: "all field are required" })
  }
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/availabletrips",
      { source_id, destination_id, date_of_journey },
      { headers }
    );
    console.log("Available trips response:", source_id, destination_id, date_of_journey);

    logApiCall({
      tag: "bus/ticket/availabletrips",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Available trips fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getTripDetails = async (req, res) => {
  const { trip_id } = req.body;
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/tripdetails",
      { trip_id },
      { headers }
    );
    logApiCall({
      tag: "/bus/ticket/tripdetails",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Trip details fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getBoardingPointDetail = async (req, res) => {
  const { bpId, trip_id } = req.body;
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/boardingPoint",
      { bpId, trip_id },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/boardingPoint",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Boarding point details fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const blockTicket = async (req, res) => {
  const requiredFields = [
    'availableTripId', 'boardingPointId', 'droppingPointId',
    'source', 'destination', 'inventoryItems',
    'bookingType', 'paymentMode', 'serviceCharge'
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      return res.status(400).json({
        status: "failed",
        message: `${field} is required`
      });
    }
  }

  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/blockticket",
      req.body,
      { headers }
    );
    console.log("Block ticket response:", req.body);
    logApiCall({
      tag: "bus/ticket/blockticket",
      requestData: req.body,
      responseData: response.data
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
    const userId = req.user.id;
    const { amount, passenger_phone, passenger_email, mpin, ...bookingData } = req.body;
    let commissions = await getApplicableServiceCharge(req.user.id, "Bus Booking")
    const charges = applyServiceCharges(amount, commissions)
    const referenceid = generateReferenceId();

    const user = await userModel.findOne({ _id: userId, mpin }).session(session).exec();

    if (!user || user.eWallet < (amount + charges.totalDeducted)) {
      throw new Error("Wrong Mpin or Insufficient wallet balance");
    }

    user.eWallet -= (amount + charges.totalDeducted);
    await user.save({ session });

    const debitTxn = await Transaction.create([{
      user_id: userId,
      transaction_type: "debit",
      amount: (amount + charges.totalDeducted),
      balance_after: user.eWallet,
      payment_mode: "wallet",
      transaction_reference_id: referenceid,
      description: `Bus ticket booking initiated with referenceId ${referenceid}`,
      status: "Pending"
    }], { session });

    const paysprintRes = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/bookticket",
      { amount, passenger_phone, passenger_email, ...bookingData, refid: referenceid },
      { headers }
    );
 

    logApiCall({
      tag: "bus/ticket/bookticket",
      requestData: req.body,
      responseData: paysprintRes.data
    });

    const { response_code, message } = paysprintRes.data;
    let status = "Failed";

    if (response_code === 1) status = "Success";
    else if ([0, 2].includes(response_code)) status = "Pending";

    const bookingRecord = new bbpsModel({
      userId,
      rechargeType: "Bus Booking",
      operator: "Bus",
      customerNumber: passenger_phone,
      amount,
      charges: charges.totalDeducted,
      transactionId: referenceid,
      extraDetails: {
        mobileNumber: passenger_phone,
        passenger_email
      },
      status
    });
    await bookingRecord.save({ session });

    debitTxn[0].status = status;
    await debitTxn[0].save({ session });

    if (status === "Failed") {
      user.eWallet += (amount + charges.totalDeducted);
      await user.save({ session });

      await Transaction.create([{
        user_id: userId,
        transaction_type: "credit",
        amount: (amount + charges.totalDeducted),
        balance_after: user.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: referenceid + "-refund",
        description: "Refund for failed ticket booking",
        status: "Success"
      }], { session });

      bookingRecord.status = "Refunded";
      await bookingRecord.save({ session });
    }
    if (status === "Success") {
      const newPayOut = new PayOut({
        userId,
        amount,
        charges: charges.totalDeducted,
        reference: referenceid,
        account: null,
        trans_mode: "WALLET" || "IMPS",
        ifsc: null,
        name: user.name,
        mobile: user.mobileNumber,
        email: user.email,
        status: "Success",
        charges: 0,
        remark: `Bus ticket booking with referenceId ${referenceid}`
      });
      await newPayOut.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(status === "Success" ? 200 : 400).json({
      status: status.toLowerCase(),
      message: message || `Ticket booking ${status.toLowerCase()}`,
      refid: referenceid,
    });

  } catch (error) {
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
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/check_booked_ticket",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/check_booked_ticket",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Ticket details retrieved successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getTicketDetails = async (req, res) => {
  const { refid } = req.body;
  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/get_ticket",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/get_ticket",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Ticket retrieved successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const getCancellationData = async (req, res) => {
  const { refid } = req.body;

  try {
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/bus/ticket/get_cancellation_data",
      { refid },
      { headers }
    );
    logApiCall({
      tag: "bus/ticket/get_cancellation_data",
      requestData: req.body,
      responseData: response.data
    });
    handleResponse(res, response.data, "Cancellation data fetched successfully");
  } catch (error) {
    res.status(500).json(handleApiError(error));
  }
};

const cancelTicket = async (req, res) => {
  const { refid, seatsToCancel } = req.body;

  const session = await startSession();
  session.startTransaction();

  try {
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
      responseData: response.data
    });

    if (response.data.response_code !== 1) {
      throw new Error(response.data.message || "Cancellation failed");
    }

    if (!refundResult.success) {
      throw new Error(refundResult.message || "Refund processing failed");
    }
    booking.status = 'cancelled';
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

  console.log("📢 Paysprint Callback Event:", event);
  console.log("📢 Paysprint Callback data:", data);

  const session = await startSession();
  session.startTransaction();

  try {
    const userId = await getUserIdFromRefid(param.refid);
    const user = await userModel.findById(userId).session(session);

    if (!user) throw new Error("User not found");

    // Debit (booking deduction)
    if (event === "BUS_TICKET_BOOKING_DEBIT_CONFIRMATION") {
      console.log("💸 Debit confirmation callback");

      user.eWallet -= parseFloat(param.total_deduction || param.amount);
      await user.save({ session });

      await Transaction.create([{
        user_id: userId,
        transaction_type: "debit",
        amount: parseFloat(param.total_deduction || param.amount),
        balance_after: user.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: param.refid,
        description: `Bus ticket booking debit confirmed for blockId ${param.block_id}`,
        status: "Success"
      }], { session });

      await bbpsModel.updateOne({ transactionId: param.refid }, { status: "Success" }).session(session);
    }

    // Credit (booking cancellation refund)
    else if (event === "BUS_TICKET_BOOKING_CREDIT_CONFIRMATION") {
      console.log("💰 Credit confirmation callback");

      user.eWallet += parseFloat(param.total_deduction || param.amount);
      await user.save({ session });

      await Transaction.create([{
        user_id: userId,
        transaction_type: "credit",
        amount: parseFloat(param.total_deduction || param.amount),
        balance_after: user.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: param.refid + "-refund",
        description: `Bus ticket booking refund for blockId ${param.block_id}`,
        status: "Success"
      }], { session });

      await bbpsModel.updateOne({ transactionId: param.refid }, { status: "Refunded" }).session(session);
    }

    // Ticket Confirmation (final booking success)
    else if (event === "BUS_TICKET_BOOKING_CONFIRMATION") {
      console.log("🎟️ Ticket final confirmation callback");

      await bbpsModel.updateOne(
        { transactionId: param.refid },
        {
          status: "Confirmed",
          extraDetails: {
            pnr_no: param.pnr_no,
            blockKey: param.blockKey,
            seatDetails: param.seat_details,
          },
        }
      ).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: 200,
      message: "Transaction completed successfully"
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Callback error:", error.message);
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
};

// Helper function to get userId from refid (dummy logic, modify as per your system)
async function getUserIdFromRefid(refid) {
  const booking = await bbpsModel.findOne({ transactionId: refid });
  if (booking) return booking.userId;
  throw new Error("Booking not found for provided refid");
}


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
  paysprintCallback
};