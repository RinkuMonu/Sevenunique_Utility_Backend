const axios = require("axios");
const crypto = require("crypto");
const xml2js = require("xml2js");
const { logApiCall } = require("../utils/chargeCaluate");
require("dotenv").config();

const BASE_URL = "https://api.instantpay.in";
const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY
const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Client-Id": "YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
        "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
        "X-Ipay-Outlet-Id": '561894', // ✅ add this
        "X-Ipay-Endpoint-Ip": "2401:4900:1c1a:3375:5938:ee58:67d7:cde7",
        // "Content-Type": "application/json",
    };
};

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
    try {
        const result = await xml2js.parseStringPromise(pidXml, { explicitArray: true });
        const pidData = result?.PidData;
        if (!pidData) throw new Error("Invalid PID XML");

        const resp = pidData.Resp?.[0] || {};
        const deviceInfo = pidData.DeviceInfo?.[0] || {};
        const skey = pidData.Skey?.[0] || {};
        const hmac = pidData.Hmac?.[0] || {};
        const data = pidData.Data?.[0] || {};

        // Extract additional_info Params safely
        let params = {};
        if (deviceInfo.additional_info?.[0]?.Param) {
            deviceInfo.additional_info[0].Param.forEach((p) => {
                if (p.$?.name && p.$?.value) {
                    params[p.$.name] = p.$.value;
                }
            });
        }

        return {
            dc: deviceInfo.$?.dc || "",
            dpId: deviceInfo.$?.dpId || "",
            rdsId: deviceInfo.$?.rdsId || "",
            Skey: skey._ || "", // actual key data
            rdsVer: deviceInfo.$?.rdsVer || "",
            mi: deviceInfo.$?.mi || "",
            mc: deviceInfo.$?.mc || "",
            ci: skey.$?.ci || "", // certificate info
            hmac: hmac || "", // actual HMAC
            pidData: data._ || "",
            srno: params.srno || "",
            ts: "",
        };
    } catch (err) {
        throw new Error("Failed to parse PID XML: " + err.message);
    }
}

// 1️⃣ Get Bank List
exports.getBankList = async (req, res) => {
    try {
        const response = await axios.post(`${BASE_URL}/fi/remit/out/domestic/v2/banks`, {}, { headers: getHeaders() });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2️⃣ Remitter Profile
exports.getRemitterProfile = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        if (!mobileNumber) {
            return res.status(400).json({ message: "mobileNumber is required" });
        }

        const response = await axios.post(
            `${BASE_URL}/fi/remit/out/domestic/v2/remitterProfile`,
            { mobileNumber },
            { headers: getHeaders() }
        );

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3️⃣ Remitter Registration
exports.registerRemitter = async (req, res) => {
    try {
        const { mobileNumber, encryptedAadhaar, referenceKey } = req.body;
        if (!mobileNumber || !encryptedAadhaar || !referenceKey) {
            return res.status(400).json({ message: "mobileNumber, encryptedAadhaar, and referenceKey are required" });
        }
        console.log("Aadhar data encrypt----", encrypt(encryptedAadhaar, encryptionKey));
        // return

        const response = await axios.post(
            `${BASE_URL}/fi/remit/out/domestic/v2/remitterRegistration`,
            { mobileNumber, encryptedAadhaar: encrypt(encryptedAadhaar, encryptionKey), referenceKey },
            { headers: getHeaders() }
        );

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4️⃣ Remitter Registration Verify
exports.verifyRemitterRegistration = async (req, res) => {
    try {
        const { mobileNumber, otp, referenceKey } = req.body;
        if (!mobileNumber || !otp || !referenceKey) {
            return res.status(400).json({ message: "mobileNumber, otp, and referenceKey are required" });
        }

        const response = await axios.post(
            `${BASE_URL}/fi/remit/out/domestic/v2/remitterRegistrationVerify`,
            { mobileNumber, otp, referenceKey },
            { headers: getHeaders() }
        );

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.remitterKyc = async (req, res) => {
    try {
        const {
            mobileNumber,
            latitude,
            longitude,
            referenceKey,
            captureType,
            externalRef,
            consentTaken,
            biometricData,
        } = req.body;

        // Input validation
        if (
            !mobileNumber ||
            !latitude ||
            !longitude ||
            !referenceKey ||
            !externalRef ||
            !consentTaken ||
            !biometricData
        ) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields",
            });
        }
        const biometricParsed = await parsePidXML(biometricData);


        // Prepare payload
        const payload = {
            mobileNumber,
            latitude,
            longitude,
            referenceKey,
            captureType: captureType || "FINGER",
            externalRef,
            consentTaken,
            biometricData: {
                ...biometricParsed,

            },
        };

        console.log(payload);
        logApiCall({
            tag: "Instantpay DMT",
            responseData: payload
        });
        // return;
        // Call InstantPay API
        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/remitterKyc",
            payload,
            { headers: getHeaders() }
        );

        res.status(200).json({
            status: true,
            message: "Remitter KYC request successful",
            data: response.data,
        });
    } catch (error) {
        console.error("Error in remitterKyc:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Remitter KYC failed",
            error: error.response?.data || error.message,
        });
    }
};




exports.beneficiaryRegistration = async (req, res) => {
    try {
        const {
            beneficiaryMobileNumber,
            remitterMobileNumber,
            ifsc,
            accountNumber,
            bankId,
            name,
        } = req.body;


        // Validate required parameters
        if (
            !beneficiaryMobileNumber ||
            !remitterMobileNumber ||
            !ifsc ||
            !accountNumber ||
            !bankId ||
            !name
        ) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }


        const body = {
            beneficiaryMobileNumber,
            remitterMobileNumber,
            ifsc,
            accountNumber,
            bankId,
            name,
        };

        // Call InstantPay API
        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/beneficiaryRegistration",
            body,
            { headers: getHeaders() }
        );

        res.status(200).json({
            status: true,
            message: "Beneficiary registration initiated successfully.",
            data: response.data,
        });
    } catch (error) {
        console.error("Beneficiary Registration Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Beneficiary registration failed.",
            error: error.response?.data || error.message,
        });
    }
};



exports.beneficiaryRegistrationVerify = async (req, res) => {
    try {
        const { remitterMobileNumber, otp, beneficiaryId, referenceKey } = req.body;

        // Validate inputs
        if (!remitterMobileNumber || !otp || !beneficiaryId || !referenceKey) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }

        const body = {
            remitterMobileNumber,
            otp,
            beneficiaryId,
            referenceKey,
        };

        // API call
        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/beneficiaryRegistrationVerify",
            body,
            { headers: getHeaders() }
        );

        res.status(200).json({
            status: true,
            message: "Beneficiary registration verified successfully.",
            data: response.data,
        });
    } catch (error) {
        console.error("Beneficiary Registration Verify Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Beneficiary verification failed.",
            error: error.response?.data || error.message,
        });
    }
};

exports.beneficiaryDelete = async (req, res) => {
    try {
        const { remitterMobileNumber, beneficiaryId } = req.body;

        if (!remitterMobileNumber || !beneficiaryId) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }

        const body = { remitterMobileNumber, beneficiaryId };

        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/beneficiaryDelete",
            body,
            { headers: getHeaders() }

        );

        res.status(200).json({
            status: true,
            message: "Beneficiary delete request initiated.",
            data: response.data,
        });
    } catch (error) {
        console.error("Beneficiary Delete Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Beneficiary delete request failed.",
            error: error.response?.data || error.message,
        });
    }
};



exports.beneficiaryDeleteVerify = async (req, res) => {
    try {
        const { remitterMobileNumber, beneficiaryId, otp, referenceKey } = req.body;

        if (!remitterMobileNumber || !beneficiaryId || !otp || !referenceKey) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }


        const body = {
            remitterMobileNumber,
            beneficiaryId,
            otp,
            referenceKey,
        };

        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/beneficiaryDeleteVerify",
            body,
            { headers: getHeaders() }

        );

        res.status(200).json({
            status: true,
            message: "Beneficiary deletion verified successfully.",
            data: response.data,
        });
    } catch (error) {
        console.error("Beneficiary Delete Verify Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Beneficiary delete verification failed.",
            error: error.response?.data || error.message,
        });
    }
};


exports.generateTransactionOtp = async (req, res) => {
    try {
        const { remitterMobileNumber, amount, referenceKey } = req.body;

        if (!remitterMobileNumber || !amount || !referenceKey) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }

        const body = { remitterMobileNumber, amount, referenceKey };

        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/generateTransactionOtp",
            body,
            { headers: getHeaders() }
        );

        res.status(200).json({
            status: true,
            message: "Transaction OTP generated successfully.",
            data: response.data,
        });
    } catch (error) {
        console.error("Generate Transaction OTP Error:", error.response?.data || error.message);
        res.status(500).json({
            status: false,
            message: "Transaction OTP generation failed.",
            error: error.response?.data || error.message,
        });
    }
};



exports.makeTransaction = async (req, res) => {
    try {
        const {
            remitterMobileNumber,
            accountNumber,
            ifsc,
            transferMode,
            transferAmount,
            latitude,
            longitude,
            referenceKey,
            otp,
            externalRef,
        } = req.body;

        // Basic validation
        if (
            !remitterMobileNumber ||
            !accountNumber ||
            !ifsc ||
            !transferMode ||
            !transferAmount ||
            !latitude ||
            !longitude ||
            !referenceKey ||
            !otp ||
            !externalRef
        ) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields.",
            });
        }
        const body = {
            remitterMobileNumber,
            accountNumber,
            ifsc,
            transferMode,
            transferAmount,
            latitude,
            longitude,
            referenceKey,
            otp,
            externalRef,
        };

        const response = await axios.post(
            "https://api.instantpay.in/fi/remit/out/domestic/v2/transaction",
            body,
            { headers: getHeaders() }

        );

        res.status(200).json({
            status: true,
            message: "Transaction successful.",
            data: response.data,
        });
    } catch (error) {
        console.error("Transaction Error:", error.response ? error.response.data : error.message);

        res.status(500).json({
            status: false,
            message: "Transaction failed.",
            error: error.response?.data || error.message,
        });
    }
};

