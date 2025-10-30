const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/serviceController.js");
const authenticateToken = require("../middleware/verifyToken.js");
const authorizeRoles = require("../middleware/verifyRole.js");
const { Joi, Segments, celebrate } = require("celebrate");

const providerSchema = Joi.object({
  providerName: Joi.string()
    .valid(
      "billAwene",
      "spritVerify",
      "serverMaintenance",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "A7",
      "A8"
    )
    .required(),

  chargeType: Joi.string().valid("fixed", "percentage").required(),

  serviceCharges: Joi.number().min(0).required(),

  distributorCommission: Joi.number().min(0).required(),

  gst: Joi.number().min(0).required(),
}).unknown(true);

const serviceValidator = {
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().required(),
    description: Joi.string().allow("").optional(),
    icon: Joi.string().required(),
    // serviceFor: Joi.array()
    //     .items(Joi.string().valid('User', 'Retailer', 'Distributor', 'ApiPartner', 'Admin'))
    //     .min(1)
    //     .required(),

    defaultSwitch: Joi.string()
      .valid(
        "billAvenue",
        "spritVerify",
        "instantPay",
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8"
      )
      .required(),

    // providers: Joi.array()
    //     .items(providerSchema)
    //     .min(1)
    //     .required(),

    isActive: Joi.boolean().optional(),
  }).unknown(true),
};

router.post(
  "/",
  celebrate(serviceValidator),
  authenticateToken,
  authorizeRoles("Admin"),
  serviceController.upsertService
);
router.post("/credit-score/check", authenticateToken, serviceController.getCreditScore);

router.get("/", authenticateToken, serviceController.getAllServices);
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("Admin"),
  serviceController.getServiceById
);
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("Admin"),
  serviceController.deleteService
);
router.put(
  "/:id/status",
  authenticateToken,
  authorizeRoles("Admin"),
  serviceController.setServiceStatus
);

module.exports = router;
