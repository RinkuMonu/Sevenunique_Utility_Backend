const crypto = require("crypto");
const axios = require("axios");

const CLIENT_ID = process.env.ISU_CLIENT_ID;
const CLIENT_SECRET = process.env.ISU_CLIENT_SECRET;
const PASS_KEY = process.env.ISU_PASS_KEY;
const API_BASE = process.env.ISU_BASE_URL;

// Decode Base64 AES key from env
const AES_KEY = Buffer.from(process.env.ISU_AES_KEY_BASE64, "base64");

// ========================
// 🔐 AES ENCRYPT/DECRYPT
// ========================
function encryptAES256(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  // Prepend IV
  return Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
}

function decryptAES256(text, key) {
  const rawData = Buffer.from(text, "base64");
  const iv = rawData.subarray(0, 16);
  const encryptedData = rawData.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedData, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ========================
// 🟢 1. Payout Initiate
// ========================
exports.initiatePayout = async (req, res) => {
  try {
    const { beneName, beneAccountNo, beneifsc, amount, fundTransferType } = req.body;

    console.log("📤 Initiating Payout with:", { beneName, beneAccountNo, beneifsc, amount, fundTransferType });

    // Header Secrets
    const headerSecrets = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    epoch: Math.floor(Date.now() / 1000).toString(),
    };
    console.log("🕒 Epoch Sent:", headerSecrets.epoch, typeof headerSecrets.epoch);

    const encHeaderSecrets = encryptAES256(JSON.stringify(headerSecrets), AES_KEY);

    // Payload
    const payload = {
      beneName,
      beneAccountNo,
      beneifsc,
      amount,
      fundTransferType,
      clientReferenceNo: "REF" + Date.now(),
    };
    const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

    console.log("🔒 Encrypted Header Secrets:", encHeaderSecrets);
    console.log("🔒 Encrypted Payload:", encPayload);

    // API Request
    const response = await axios.post(
      `https://apidev-sdk.iserveu.online/payout/transfer`,
      { RequestData: encPayload },
      {
        headers: {
          pass_key: PASS_KEY,
          header_secrets: encHeaderSecrets,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📥 Raw Response:", response.data);

    const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
    console.log("🔓 Decrypted Response:", decrypted);

    return res.json({ success: true, data: JSON.parse(decrypted) });
  } catch (err) {
    console.error("❌ Payout Error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

// ========================
// 🟢 2. Callback
// ========================
exports.payoutCallback = async (req, res) => {
  try {
    console.log("📥 Callback Received Raw:", req.body);

    const { ResponseData } = req.body;
    const decrypted = decryptAES256(ResponseData, AES_KEY);
    const data = JSON.parse(decrypted);

    console.log("🔓 Decrypted Callback Data:", data);

    // TODO: Save/update DB transaction status

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Callback Error:", err.message);
    return res.status(500).json({ success: false });
  }
};

// ========================
// 🟢 3. Check Status
// ========================
exports.checkStatus = async (req, res) => {
  try {
    const { clientReferenceNo } = req.body;
    console.log("📤 Checking Status for:", clientReferenceNo);

    // Header Secrets
    const headerSecrets = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    epoch: Math.floor(Date.now() / 1000).toString(),
    };
    console.log("🕒 Epoch Sent:", headerSecrets.epoch, typeof headerSecrets.epoch);
    const encHeaderSecrets = encryptAES256(JSON.stringify(headerSecrets), AES_KEY);

    const payload = { clientReferenceNo };
    const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

    console.log("🔒 Encrypted Status Payload:", encPayload);

    const response = await axios.post(
      `https://apidev-sdk.iserveu.online/payout/status`,
      { RequestData: encPayload },
      {
        headers: {
          pass_key: PASS_KEY,
          header_secrets: encHeaderSecrets,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📥 Raw Status Response:", response.data);

    const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
    console.log("🔓 Decrypted Status Response:", decrypted);

    return res.json({ success: true, data: JSON.parse(decrypted) });
  } catch (err) {
    console.error("❌ Status Check Error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
