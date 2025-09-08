const express = require("express");
const router = express.Router();
const userMetaController = require("../controllers/userMetaController.js");
const Joi = require("joi");
const { celebrate, Segments } = require("celebrate");
const authenticateToken = require("../middleware/verifyToken.js");

const serviceSchema = Joi.object({
    serviceId: Joi.string().required(),
    chargeType: Joi.string().valid("fixed", "percentage").required(),
    serviceCharges: Joi.number().min(0).required(),
    gst: Joi.number().min(0).required(),
    distributorCommission: Joi.number().min(0).required()
}).unknown(true);

const validateUpsertUserMeta = celebrate({
    [Segments.BODY]: Joi.object({
        userId: Joi.string().required(),
        ipWhitelist: Joi.array().items(Joi.string().ip()).default([]),
        services: Joi.array().items(serviceSchema).min(1).optional(),
        preferences: Joi.object().default({}),
    }),
});

const validateGetUserMeta = celebrate({
    [Segments.PARAMS]: Joi.object({
        userId: Joi.string().required(),
    }),
});

const validateRemoveUserService = celebrate({
    [Segments.BODY]: Joi.object({
        userId: Joi.string().required(),
        serviceId: Joi.string().required(),
    }),
});



router.post("/upsert", authenticateToken, userMetaController.upsertUserMeta);

router.get("/:userId", authenticateToken, userMetaController.getUserMeta);

router.post("/remove-service", authenticateToken, validateRemoveUserService, userMetaController.removeUserService);

router.get("/", authenticateToken, userMetaController.getAllUserMeta);



module.exports = router;
