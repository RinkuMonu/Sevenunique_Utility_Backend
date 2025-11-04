const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");

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
  return Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString(
    "base64"
  );
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

// Generate Token Controller
exports.generateToken = async (req, res) => {
  try {
    const data = qs.stringify({
      authKey: "UTI6tamscw",
      authSecret: "4jtudpz0ri1x2t@y",
    });

    const response = await axios.post(
      "https://admin.finuniques.in/api/v1.1/t1/oauth/token",
      data,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const token = response.data?.token;
    console.log("Generated Token payout ka :", token);

    if (!token) {
      return res
        .status(400)
        .json({ message: "Token not received", response: response.data });
    }

    // Save token in session
    req.session.token = token;

    res.status(200).json({
      success: true,
      message: "Token generated successfully",
      token,
    });
  } catch (error) {
    console.error(
      "Token Generation Error:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to generate token",
      error: error.response?.data || error.message,
    });
  }
};

const FormData = require("form-data");

exports.initiatePayout = async (req, res) => {
  try {
    const {
      beneName,
      beneAccountNo,
      beneifsc,
      benePhoneNo,
      beneBankName,
      clientReferenceNo,
      amount,
      fundTransferType,
      pincode,
      custName,
      custMobNo,
      custIpAddress,
      latlong,
      paramA,
      paramB,
    } = req.body;

    // 1️⃣ Get access token
    const tokenResponse = await axios.post(
      "https://admin.finuniques.in/api/v1.1/t1/oauth/token",
      new URLSearchParams({
        authKey: "UTI6tamscw",
        authSecret: "4jtudpz0ri1x2t@y",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const accessToken = tokenResponse?.data?.data?.access_token;
    console.log("✅ Access Token:", accessToken);

    if (!accessToken) {
      return res
        .status(400)
        .json({ success: false, message: "Failed to fetch token" });
    }

    // 2️⃣ Prepare multipart form-data
    const formData = new FormData();
    formData.append("amount", amount);
    formData.append("reference", clientReferenceNo);
    formData.append("trans_mode", fundTransferType); // e.g., "imps" or "neft"
    formData.append("account", beneAccountNo);
    formData.append("ifsc", beneifsc);
    formData.append("name", beneName);
    formData.append("email", paramA || "demo@gmail.com");
    formData.append("mobile", benePhoneNo);
    formData.append("address", paramB || "Mumbai");

    // Optional extras if you want to pass them:
    if (pincode) formData.append("pincode", pincode);
    if (custName) formData.append("custName", custName);
    if (custMobNo) formData.append("custMobNo", custMobNo);
    if (custIpAddress) formData.append("custIpAddress", custIpAddress);
    if (latlong) formData.append("latlong", latlong);

    // 3️⃣ Make payout API call
    const payoutResponse = await axios.post(
      "https://admin.finuniques.in/api/v1.1/t1/withdrawal",
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...formData.getHeaders(),
        },
      }
    );

    console.log("✅ Payout Response:", payoutResponse.data);

    // 4️⃣ Return to frontend
    return res.status(200).json({
      success: true,
      message: "Payout request processed successfully",
      data: payoutResponse.data,
    });
  } catch (error) {
    console.error(
      "❌ Error in initiatePayout:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: "Payout failed",
      error: error.response?.data || error.message,
    });
  }
};

// ========================
// 🟢 1. Payout Initiate

// exports.initiatePayout = async (req, res) => {
//   try {
//     const {
//       beneName,
//       beneAccountNo,
//       beneifsc,
//       benePhoneNo,
//       beneBankName,
//       clientReferenceNo,
//       amount,
//       fundTransferType,
//       pincode,
//       custName,
//       custMobNo,
//       custIpAddress,
//       latlong,
//       paramA,
//       paramB,
//     } = req.body;

//     console.log("📤 Initiating Payout with:", req.body);

//     // Header Secrets
//     const headerSecrets = {
//       client_id: CLIENT_ID,
//       client_secret: CLIENT_SECRET,
//       epoch: Math.floor(Date.now() / 1000).toString(),
//     };
//     const encHeaderSecrets = encryptAES256(
//       JSON.stringify(headerSecrets),
//       AES_KEY
//     );

//     // Payload
//     const payload = {
//       beneName,
//       beneAccountNo,
//       beneifsc,
//       benePhoneNo: Number(benePhoneNo),
//       beneBankName,
//       clientReferenceNo,
//       amount: Number(amount),
//       fundTransferType,
//       pincode: Number(pincode),
//       custName,
//       custMobNo: Number(custMobNo),
//       custIpAddress,
//       latlong,
//       paramA: paramA || "",
//       paramB: paramB || "",
//     };

//     const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

//     // API Call
//     const response = await axios.post(
//       `${API_BASE}/w1w2-payout/w1/cashtransfer`,
//       { RequestData: encPayload },
//       {
//         headers: {
//           pass_key: PASS_KEY,
//           header_secrets: encHeaderSecrets,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     console.log("📥 Raw Response:", response.data);

//     const decrypted = decryptAES256(response.data.ResponseData, AES_KEY);
//     console.log("🔓 Decrypted Response:", decrypted);

//     return res.json({ success: true, data: JSON.parse(decrypted) });
//   } catch (err) {
//     console.error("❌ Payout Error:", err.response?.data || err.message);
//     return res
//       .status(500)
//       .json({ success: false, message: "Something went wrong" });
//   }
// };

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


/**
 * @desc Send payout transaction
 * @route POST /api/payout
 */

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
    console.log(
      "🕒 Epoch Sent:",
      headerSecrets.epoch,
      typeof headerSecrets.epoch
    );
    const encHeaderSecrets = encryptAES256(
      JSON.stringify(headerSecrets),
      AES_KEY
    );

    const payload = { clientReferenceNo };
    const encPayload = encryptAES256(JSON.stringify(payload), AES_KEY);

    console.log("🔒 Encrypted Status Payload:", encPayload);

    const response = await axios.post(
      `https://apidev-sdk.iserveu.online/w1w2-payout/w1/cashtransfer/payout/status`,
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
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};
