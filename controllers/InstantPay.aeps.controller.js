// controllers/merchantOnboardingController.js
const axios = require("axios");
const crypto = require("crypto");
const xml2js = require("xml2js");
const mongoose = require("mongoose");
const { logApiCall } = require("../utils/chargeCaluate");
const userModel = require("../models/userModel");


const INSTANTPAY_BASE_URL = "https://api.instantpay.in";
const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY
const getHeaders = () => {

    return {
        "Content-Type": "application/json",
        "X-Ipay-Client-Id": "YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
        "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Endpoint-Ip": "2401:4900:1c1a:3375:746d:e3a:7400:ecb0",
        "Content-Type": "application/json",
    };
};

// 🔐 Encrypt function
function encrypt(text, key) {
    const encryptionKey = Buffer.from(key); // 32 bytes
    const algorithm = "aes-256-cbc";
    const iv = crypto.randomBytes(16); // 16 bytes IV
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    // IV ko bhi attach kar dete hain (Base64 me safe transfer ke liye)
    const encryptedData = Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
    return encryptedData;
}

async function parsePidXML(pidXml) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(pidXml, { explicitArray: true }, (err, result) => {
            if (err) return reject(err);

            try {
                const resp = result.PidData.Resp[0];
                const deviceInfo = result.PidData.DeviceInfo[0];
                const skey = result.PidData.Skey[0];
                const hmac = result.PidData.Hmac[0];
                const data = result.PidData.Data[0];

                // extract additional_info Params
                let params = {};
                if (deviceInfo.additional_info && deviceInfo.additional_info[0].Param) {
                    deviceInfo.additional_info[0].Param.forEach((p) => {
                        params[p.$.name] = p.$.value;
                    });
                }

                resolve({
                    dc: deviceInfo.$.dc,
                    dpId: deviceInfo.$.dpId,
                    rdsId: deviceInfo.$.rdsId,
                    rdsVer: deviceInfo.$.rdsVer,
                    mi: deviceInfo.$.mi,
                    mc: deviceInfo.$.mc,
                    ci: skey.$.ci,
                    sessionKey: skey._,
                    hmac: hmac,
                    pidDataType: data.$.type,
                    pidData: data._,
                    errCode: resp.$.errCode,
                    errInfo: resp.$.errInfo,
                    fCount: resp.$.fCount || "0",
                    fType: resp.$.fType || "0",
                    iCount: resp.$.iCount || "0",
                    pCount: resp.$.pCount || "0",
                    qScore: resp.$.qScore || "",
                    nmPoints: resp.$.nmPoints || "",
                    srno: params.srno || "",
                    sysid: params.sysid || "",
                    ts: params.ts || "",
                    // modality_type: params.modality_type || "",
                    // device_type: params.device_type || "",
                });
            } catch (e) {
                reject(e);
            }
        });
    });
}





// ✅ Signup eKYC Initiate
exports.signupInitiate = async (req, res) => {

    try {
        const {
            mobile,
            pan,
            email,
            aadhaar,
            bankAccountNo,
            bankIfsc,
            latitude,
            longitude,
            consent,
        } = req.body;
        const userId = req.user.id;
        const user = await userModel.findById(userId);
        if (!user) throw new Error("User not found");
        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/signup/initiate`,
            {
                mobile,
                pan,
                email,
                aadhaar: encrypt(aadhaar, encryptionKey),
                bankAccountNo,
                bankIfsc,
                latitude,
                longitude,
                consent,
            },
            { headers: getHeaders() }
        );
        user.aepsInstantPayLat = latitude
        user.aepsInstantPayLng = longitude
        await user.save();
        res.status(200).json(response.data);
    } catch (error) {
        console.error("Signup Initiate Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};

// ✅ Signup eKYC Validate
exports.signupValidate = async (req, res) => {
    try {
        const { otpReferenceID, otp, hash } = req.body;

        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/signup/validate`,
            { otpReferenceID, otp, hash },
            { headers: getHeaders() }
        );

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Signup Validate Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};
// ✅ Merchant Biometric
exports.MerchantBiometric = async (req, res) => {
    try {
        const user = await userModel.findById(req.user.id);
        const { outletId } = req.body;

        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/signup/biometricKycStatus`,
            { spkey: "DMI" },
            {
                headers: {
                    ...getHeaders(),
                    "X-Ipay-Outlet-Id": outletId,
                },
            }
        );

        const action = response?.data?.data?.action;
        const status = response?.data?.data?.status;

        if (action == "ACTION-REQUIRED") {
            user.aepsInstantPayBio = "Pending";
        } else if (action === "NO-ACTION-REQUIRED" && status == "PENDING") {
            user.aepsInstantPayBio = "Progress";
        } else if (action == "NO-ACTION-REQUIRED" && status == "APPROVED") {
            user.aepsInstantPayBio = "Success";
        }

        await user.save();

        logApiCall({
            url: "/biometricKycStatus",
            requestData: { outletId },
            responseData: response
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Merchant Biometric Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};

exports.MerchantBiometricKyc = async (req, res) => {
    try {
        const user = await userModel.findById(req.user.id)
        const { outletId, referenceKey, latitude, longitude, pidData, aadhaar } = req.body
        const externalRef = `ACW-${new mongoose.Types.ObjectId()}`;
        const biometricParsed = await parsePidXML(pidData);
        const payload = {
            referenceKey,
            latitude,
            longitude,
            externalRef,
            biometricData: {
                // encryptedAadhaar: encrypt(aadhaar, encryptionKey),
                ...biometricParsed,

            },
        }
        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/signup/biometricKyc`,
            payload,
            {
                headers: {
                    ...getHeaders(),
                    "X-Ipay-Outlet-Id": outletId,
                },
            }
        );
        if (response.data.statuscode == "TXN") {
            user.aepsInstantPayBio = "Progress"
            await user.save();
        }
        logApiCall({ url: "/biometricKyc", requestData: { payload }, responseData: response });
        res.status(200).json(response.data);
    } catch (error) {
        console.error("Merchant Biometric Kyc Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};

// ✅ Mobile Change Initiate
exports.mobileChangeInitiate = async (req, res) => {
    try {
        const { existingMobileNumber, newMobileNumber } = req.body;

        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/mobileUpdate`,
            { existingMobileNumber, newMobileNumber },
            { headers: getHeaders() }
        );

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Mobile Change Initiate Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};

// ✅ Mobile Change Validate
exports.mobileChangeValidate = async (req, res) => {
    try {
        const { existingMobileNumber, newMobileNumber, otp } = req.body;

        // Make API request with proper payload
        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/mobileUpdateVerify`,
            {
                existingMobileNumber,
                newMobileNumber,
                otp
            },
            { headers: getHeaders(req.body.ip) } // optionally pass client IP
        );

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Mobile Change Validate Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};


exports.getMerchantList = async (req, res) => {
    try {
        let { pageNumber, recordsPerPage, search } = req.body;
        const isPAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(search);
        const isMobile = /^[0-9]{10}$/.test(search);
        const isOutletId = /^[0-9]+$/.test(search) && !isMobile;  



        const requestBody = {
            pagination: {
                pageNumber: pageNumber || 1,
                recordsPerPage: recordsPerPage || 10,
            },
            filters: {
                outletId: isOutletId ? Number(search) : 0,
                mobile: isMobile ? search : "",
                pan: isPAN ? search.toUpperCase() : "",
            }
        };

        const response = await axios.post(
            `${INSTANTPAY_BASE_URL}/user/outlet/list`,
            requestBody,
            { headers: getHeaders() }
        );

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Merchant List Error:", error?.response?.data || error.message);
        res.status(400).json({
            status: false,
            message: error?.response?.data || error.message,
        });
    }
};

