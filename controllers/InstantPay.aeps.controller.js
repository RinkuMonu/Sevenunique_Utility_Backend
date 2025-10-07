// controllers/merchantOnboardingController.js
const axios = require("axios");
const crypto = require("crypto");


const INSTANTPAY_BASE_URL = "https://api.instantpay.in";
const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY
const getHeaders = () => {
    
    return {
        "Content-Type": "application/json",
    "X-Ipay-Client-Id":"YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
    "X-Ipay-Client-Secret":"82626bbdd785562e2bc2c62e02e5ea949bc8ac1711a18d4c4a6f64a7c7cd9a4c",
    "X-Ipay-Auth-Code": "1",
    "X-Ipay-Outlet-Id": process.env.IPAY_OUTLET_ID, // ✅ add this
    "X-Ipay-Endpoint-Ip":"2401:4900:1c1a:3375:f50a:7af6:7ff5:16a3",
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
        console.log(getHeaders());
        console.log(encrypt(aadhaar, encryptionKey));

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
        const { pageNumber, recordsPerPage, outletId, mobile, pan } = req.body;

        const requestBody = {
            pagination: {
                pageNumber: pageNumber || 1,
                recordsPerPage: recordsPerPage || 10,
            },
            filters: {
                outletId: outletId || 0,
                mobile: mobile || "",
                pan: pan || "",
            },
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
