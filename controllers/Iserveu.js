const crypto = require("crypto");
require("dotenv").config();

const {
  AEPS_PASS_KEY,
  AEPS_CLIENT_ID,
  AEPS_CLIENT_SECRET,
  AEPS_ENCR_KEY,
} = process.env;

// 🔹 Token Generate
// backend/controllers/aepsController.js
exports.getToken = (req, res) => {
  try {
    const payload = JSON.stringify({
      client_id: process.env.AEPS_CLIENT_ID,
      client_secret: process.env.AEPS_CLIENT_SECRET,
      epoch: Date.now().toString(),
    });

    const iv = crypto.randomBytes(16);
    const key = Buffer.from(process.env.AEPS_ENCR_KEY, "base64");
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(payload, "utf8", "base64");
    encrypted += cipher.final("base64");

    const result = Buffer.concat([
      iv,
      Buffer.from(encrypted, "base64"),
    ]).toString("base64");

    // 👉 Send all required fields
    res.json({
      token: result,
      pass_key: process.env.AEPS_PASS_KEY,
      apiusername: process.env.AEPS_API_USERNAME,
      username: process.env.AEPS_USERNAME,
    });
  } catch (err) {
    console.error("Token generation error:", err);
    res.status(500).json({ status: 1, statusDesc: "Token generation failed" });
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
