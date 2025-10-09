import axios from "axios";
import crypto from "crypto";
import xml2js from "xml2js";
const BASE_URL = "https://api.instantpay.in/fi/remit/out/domesticPpi";

const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Client-Id": "YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
        "X-Ipay-Client-Secret": "9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
        "X-Ipay-Outlet-Id": '561907 ', // ✅ add this 
        "X-Ipay-Endpoint-Ip": "2401:4900:1c1a:3375:746d:e3a:7400:ecb0",
        "Content-Type": "application/json",
    };
};
const encryptionKey = 'efb0a1c3666c5fb0efb0a1c3666c5fb0' || process.env.INSTANTPAY_AES_KEY

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
            ts: params.ts || "",
        };
    } catch (err) {
        throw new Error("Failed to parse PID XML: " + err.message);
    }
}

export const instantpayService = async (endpoint, method = "POST", data = {}) => {
    try {
        const config = {
            method,
            url: `${BASE_URL}/${endpoint}`,
            headers: getHeaders(),
            data,
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`❌ Error in ${endpoint}:`, error.response?.data || error.message);
        throw new Error(error.response?.data?.status || "InstantPay API Error");
    }
};

// 1️⃣ Bank List
export const getBankList = async (req, res) => {
    try {
        const result = await instantpayService("banks");
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2️⃣ Remitter Profile
export const remitterProfile = async (req, res) => {
    try {
        const result = await instantpayService("remitterProfile", "POST", req.body);
        res.json(result);
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: err.message });
    }
};

// 3️⃣ Remitter Registration
export const remitterRegistration = async (req, res) => {
    try {
        const { mobileNumber, encryptedAadhaar, referenceKey, pan } = req.body;
        if (!mobileNumber || !encryptedAadhaar || !referenceKey || !pan) {
            return res.status(400).json({ message: "mobileNumber, encryptedAadhaar, and referenceKey are required" });
        }
        const result = await instantpayService("remitterRegistration", "POST", { mobileNumber, pan, encryptedAadhaar: encrypt(encryptedAadhaar, encryptionKey), referenceKey });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4️⃣ Remitter Registration Verify
export const remitterRegistrationVerify = async (req, res) => {
    try {
        const result = await instantpayService("remitterRegistrationVerify", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5️⃣ Remitter KYC
export const remitterKyc = async (req, res) => {
    try {
        const { pidXml, mobileNumber, latitude, longitude, externalRef, consentTaken = "Y", captureType = "FINGER", referenceKey } = req.body;

        if (!pidXml) {
            return res.status(400).json({ error: "PID XML is required" });
        }

        // 1️⃣ Parse PID XML
        const biometricData = await parsePidXML(pidXml);

        // 2️⃣ Prepare payload
        const payload = {
            mobileNumber,
            latitude,
            longitude,
            externalRef,
            consentTaken,
            captureType,
            biometricData,
            referenceKey
        };
        console.log(payload);

        // 3️⃣ Call InstantPay API
        const result = await instantpayService("remitterKyc", "POST", payload);

        res.json(result);
    } catch (err) {
        console.error("Remitter KYC error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 6️⃣ Beneficiary List
export const beneficiaryList = async (req, res) => {
    try {
        const {
            remitterMobileNumber, referenceKey
        } = req.query

        const result = await instantpayService("beneficiaryList", "GET", { remitterMobileNumber, referenceKey, isSyncMode: true });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7️⃣ Beneficiary Registration
export const beneficiaryRegistration = async (req, res) => {
    try {
        const result = await instantpayService("beneficiaryRegistration", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 8️⃣ Beneficiary Delete
export const beneficiaryDelete = async (req, res) => {
    try {
        const result = await instantpayService("beneficiaryDelete", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 9️⃣ Beneficiary Delete Verify
export const beneficiaryDeleteVerify = async (req, res) => {
    try {
        const result = await instantpayService("beneficiaryDeleteVerify", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 🔟 Generate Transaction OTP
export const generateTransactionOtp = async (req, res) => {
    try {
        const result = await instantpayService("generateTransactionOtp", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 11️⃣ Transaction
export const makeTransaction = async (req, res) => {
    try {
        const result = await instantpayService("transaction", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 12️⃣ Transaction Refund OTP
export const transactionRefundOtp = async (req, res) => {
    try {
        const result = await instantpayService("transactionRefundOtp", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 13️⃣ Transaction Refund
export const transactionRefund = async (req, res) => {
    try {
        const result = await instantpayService("transactionRefund", "POST", req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
