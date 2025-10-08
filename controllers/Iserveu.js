const CryptoJS = require("crypto-js");
require("dotenv").config();

const {
  AEPS_PASS_KEY,
  AEPS_CLIENT_ID,
  AEPS_CLIENT_SECRET,
  AEPS_ENCR_KEY,
} = process.env;



exports.getToken = (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = JSON.stringify({
      client_id: process.env.AEPS_CLIENT_ID,
      client_secret: process.env.AEPS_CLIENT_SECRET,
      epoch: timestamp.toString(),
    });

    const key = process.env.AEPS_ENCR_KEY; // base64 encoded
    const decodedKey = CryptoJS.enc.Base64.parse(key);

    // Generate random IV (16 bytes)
    const iv = CryptoJS.lib.WordArray.random(16);

    // AES-256-CBC encryption
    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(payload),
      decodedKey,
      {
        iv: iv,
        padding: CryptoJS.pad.Pkcs7,
        mode: CryptoJS.mode.CBC,
      }
    );

    // Combine IV + ciphertext, then encode in Base64
    const combined = iv.concat(encrypted.ciphertext);
    const encryptedToken = CryptoJS.enc.Base64.stringify(combined);
    console.log("encryptedToken---", encryptedToken);
    // return;
    res.json({
      token: encryptedToken,
      pass_key: process.env.AEPS_PASS_KEY,
      apiusername: process.env.AEPS_API_USERNAME,
      username: process.env.AEPS_USERNAME,
    });
  } catch (err) {
    console.error("Token generation error:", err);
    res
      .status(500)
      .json({ status: 1, statusDesc: "Token generation failed" });
  }
};



// 🔹 Callback Handler
exports.aepsCallback = async (req, res) => {
  try {
    console.log("AEPS Callback Data:", req.body);

    const { amount, status, txnId, retailerId } = req.body;

    if (status !== "SUCCESS") {
      return res.json({ status: 0, statusDesc: "Transaction Failed" });
    }

    // Example: Commission calculation (backend me slab ke hisaab se lagana)
    const commissionSlab = {
      retailer: 0.5,
      distributor: 0.2,
      admin: 0.3,
      type: "percent",
    };

    let retailerComm = (amount * commissionSlab.retailer) / 100;
    let distributorComm = (amount * commissionSlab.distributor) / 100;
    let adminComm = (amount * commissionSlab.admin) / 100;

    // TODO: DB me transaction save + wallet update logic
    console.log("Commission:", {
      retailerComm,
      distributorComm,
      adminComm,
    });

    res.json({ status: 1, statusDesc: "Success" });
  } catch (err) {
    console.error("Callback Error:", err);
    res.status(500).json({ status: 1, statusDesc: "Internal Server Error" });
  }
};
// 🔹 Callback Handler
exports.matmCallback = async (req, res) => {
  try {
    console.log("matm Callback Data:", req.body);

    const { amount, status, txnId, retailerId } = req.body;

    if (status !== "SUCCESS") {
      return res.json({ status: 0, statusDesc: "Transaction Failed" });
    }

    // Example: Commission calculation (backend me slab ke hisaab se lagana)
    const commissionSlab = {
      retailer: 0.5,
      distributor: 0.2,
      admin: 0.3,
      type: "percent",
    };

    let retailerComm = (amount * commissionSlab.retailer) / 100;
    let distributorComm = (amount * commissionSlab.distributor) / 100;
    let adminComm = (amount * commissionSlab.admin) / 100;

    // TODO: DB me transaction save + wallet update logic
    console.log("Commission:", {
      retailerComm,
      distributorComm,
      adminComm,
    });

    res.json({ status: 1, statusDesc: "Success" });
  } catch (err) {
    console.error("Callback Error:", err);
    res.status(500).json({ status: 1, statusDesc: "Internal Server Error" });
  }
};
