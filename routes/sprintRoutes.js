const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");
const { Joi, Segments, celebrate } = require("celebrate");
const {
  getOperatorList,
  doRecharge,
  hlrCheck,
  browsePlan,
  checkRechargeStatus,
  getBillOperatorList,
  fetchBillDetails,
  payBill,
  checkBillPaymentStatus,
  dthPlan,
} = require("../controllers/SprintVerify/rechargeController.js");
const serviceChargeMiddleware = require("../middleware/serviceCharge.js");
const busController = require("../controllers/SprintVerify/busBookingController.js");
const {
  creditCard,
} = require("../controllers/SprintVerify/creditCardApply.js");

const refidValidator = celebrate({
  [Segments.BODY]: Joi.object({
    refid: Joi.string().required(),
  }),
});

router.post(
  "/recharge/hlrcheck",
  authenticateToken,
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      number: Joi.number().required(),
      type: Joi.string().required(),
    }),
  }),
  hlrCheck
);

router.get(
  "/recharge/browseplan",
  authenticateToken,
  celebrate({
    [Segments.QUERY]: Joi.object().keys({
      circle: Joi.string().required(),
      op: Joi.string().required(),
    }),
  }),
  browsePlan
);

router.post("/recharge/dthPlan", authenticateToken, dthPlan);
router.post("/generate_utm",authenticateToken, creditCard);

router.get("/recharge/opertor", authenticateToken, getOperatorList);

router.post(
  "/recharge/dorecharge",
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      operator: Joi.string().required(),
      canumber: Joi.string().required(),
      amount: Joi.number().required(),
      category: Joi.string().required(),
      mpin: Joi.string().required(),
    }),
  }),
  authenticateToken,
  doRecharge
);

router.get(
  "/recharge/status/:transactionId",
  authenticateToken,
  celebrate({
    [Segments.PARAMS]: Joi.object().keys({
      transactionId: Joi.string().required(),
    }),
  }),
  checkRechargeStatus
);

router.get("/bill/operators", authenticateToken, getBillOperatorList);

router.post("/bill/details", authenticateToken, fetchBillDetails);

router.post("/bill/pay", authenticateToken, payBill);

router.post("/bill/status", authenticateToken, checkBillPaymentStatus);

// busBooking routtes

router.get("/source", authenticateToken, busController.getSourceCities);

router.post(
  "/availabletrips",
  authenticateToken,
  busController.getAvailableTrips
);

router.post("/tripdetails", authenticateToken, busController.getTripDetails);

router.post(
  "/boardingPoint",
  celebrate({
    [Segments.BODY]: Joi.object({
      bpId: Joi.string().required(),
      trip_id: Joi.string().required(),
    }),
  }),
  authenticateToken,
  busController.getBoardingPointDetail
);

router.post("/blockticket", authenticateToken, busController.blockTicket);

router.post(
  "/bookticket",
  celebrate({
    [Segments.BODY]: Joi.object({
      refid: Joi.string().required(),
      amount: Joi.number().positive().required(),
      base_fare: Joi.number().positive().required(),
      blockKey: Joi.string().required(),
      passenger_phone: Joi.string().required(),
      passenger_email: Joi.string().email().required(),
      mpin: Joi.string().required(),
    }),
  }),
  authenticateToken,
  busController.bookTicket
);
router.post("/callback/paysprint", busController.paysprintCallback);

router.post(
  "/check_booked_ticket",
  refidValidator,
  authenticateToken,
  busController.checkBookedTicket
);

router.post(
  "/get_ticket",
  refidValidator,
  authenticateToken,
  busController.getTicketDetails
);

router.post(
  "/get_cancellation_data",
  refidValidator,
  authenticateToken,
  busController.getCancellationData
);

router.post(
  "/cancel_ticket",
  celebrate({
    [Segments.BODY]: Joi.object({
      refid: Joi.string().required(),
      seatsToCancel: Joi.array()
        .items(Joi.string().required())
        .min(1)
        .required(),
    }),
  }),
  authenticateToken,
  busController.cancelTicket
);

module.exports = router;
