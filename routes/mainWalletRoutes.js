const express = require('express');
const { celebrate, Segments, Joi } = require('celebrate');
const authenticateToken = require('../middleware/verifyToken.js');
const { allPayin, generatePayment, callbackPayIn, checkPayInStatus, createPayIn, callbackGet } = require('../controllers/payInController.js');
const { getPayOuts, generatePayOut, callbackPayout, getPayoutStatus } = require('../controllers/payoutController.js');
const router = express.Router();

const validation = {
    [Segments.QUERY]: Joi.object().keys({
        userId: Joi.string()
            .hex()
            .length(24)
            .optional()
            .allow(null, "")
            .messages({
                "string.hex": `"userId" must be a valid hex string`,
                "string.length": `"userId" must be exactly 24 characters long`,
            }),

        status: Joi.string()
            .valid("Pending", "Success", "Failed", "")
            .optional()
            .allow(null, "")
            .default("")
            .messages({
                "any.only": `"status" must be one of: Pending, Success, Failed`,
            }),

        fromDate: Joi.date()
            .iso()
            .optional()
            .allow(null, "")
            .default(null),

        toDate: Joi.date()
            .iso()
            .optional().allow(null, "")
            .default(null),

        exportCsv: Joi.string()
            .valid("true", "false")
            .default("false"),

        page: Joi.number()
            .integer()
            .min(1)
            .default(1),

        limit: Joi.number()
            .integer()
            .min(1)
            .max(100)
            .default(10),
    })
        .unknown(true),
};


router.get('/payin', celebrate(validation), authenticateToken, allPayin);
router.post('/paygen', createPayIn)
router.post('/payin', authenticateToken, generatePayment);
router.post('/payin/callback', callbackPayIn);
router.post('/payin/callbackGet', callbackGet);
router.get('/payin/:reference', authenticateToken, checkPayInStatus);

router.get('/payout', celebrate(validation), authenticateToken, getPayOuts);
router.post('/payout', authenticateToken, generatePayOut);
router.post('/payout/callback', callbackPayout);
router.get('/payout/:reference', authenticateToken, getPayoutStatus);

module.exports = router;