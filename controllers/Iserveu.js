const { default: axios } = require("axios");
const CryptoJS = require("crypto-js");
require("dotenv").config();
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");
const path = require("path");
const userModel = require("../models/userModel");

const { AEPS_PASS_KEY, AEPS_CLIENT_ID, AEPS_CLIENT_SECRET, AEPS_ENCR_KEY } =
  process.env;

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

// Excel Mapping Function

exports.sendAepsExcelMail = async (req, res) => {
  try {
    // ✅ 1. SAFE BODY PARSING
    const formData = req.body?.formData;
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }
    const userId = req.user.id;
    const user = await userModel.findById(userId).select("isOnBoardEmailSend");
    console.log(user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.isOnBoardEmailSend === true) {
      return res.status(400).json({
        success: false,
        message: "Onboarding mail already sent",
      });
    }
    if (!formData || typeof formData !== "object") {
      return res.status(400).json({
        success: false,
        message: "Unknown/Missing data",
      });
    }

    // ✅ 2. REQUIRED FIELD VALIDATION
    const requiredFields = [
      "bcagentid",
      "bcagentname",
      "companyname",
      "mobilenumber",
      "email",
      "lat",
      "long",
    ];

    for (let field of requiredFields) {
      if (!formData[field] || String(formData[field]).trim() === "") {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    const safeData = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [
        key,
        String(value || "")
          .toString()
          .trim(),
      ])
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("BC Agent Data");

    worksheet.columns = [
      { header: "bcagentid", key: "bcagentid" },
      { header: "bcagentname", key: "bcagentname" },
      { header: "lastname", key: "lastname" },
      { header: "companyname", key: "companyname" },
      { header: "address", key: "address" },
      { header: "area", key: "area" },
      { header: "pincode", key: "pincode" },
      { header: "mobilenumber", key: "mobilenumber" },
      { header: "shopname", key: "shopname" },
      { header: "shopaddress", key: "shopaddress" },
      { header: "shopstate", key: "shopstate" },
      { header: "shopcity", key: "shopcity" },
      { header: "shopdistrict", key: "shopdistrict" },
      { header: "shoparea", key: "shoparea" },
      { header: "shoppincode", key: "shoppincode" },
      { header: "pancard", key: "pancard" },
      { header: "email", key: "email" },
      { header: "AADHAAR", key: "AADHAAR" },
      { header: "lat", key: "lat" },
      { header: "long", key: "long" },
      { header: "apiusername", key: "apiusername" },
    ];

    worksheet.addRow({
      bcagentid: safeData.bcagentid,
      bcagentname: safeData.bcagentname,
      lastname: safeData.lastname,
      companyname: safeData.companyname,
      address: safeData.address,
      area: safeData.area,
      pincode: safeData.pincode,
      mobilenumber: safeData.mobilenumber,
      shopname: safeData.shopname,
      shopaddress: safeData.shopaddress,
      shopstate: safeData.shopstate,
      shopcity: safeData.shopcity,
      shopdistrict: safeData.shopdistrict,
      shoparea: safeData.shoparea,
      shoppincode: safeData.shoppincode,
      pancard: safeData.pancard,
      email: safeData.email,
      AADHAAR: safeData.AADHAAR,
      lat: safeData.lat,
      long: safeData.long,
      apiusername: safeData.apiusername,
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // ✅ 5. SAFE SMTP CONFIG (NO HARDCODED CREDENTIALS)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });

    await transporter.verify();

    // ✅ 7. SEND EMAIL SAFELY
    await transporter.sendMail({
      from: `"SevenUnique" <info@sevenunique.com>`,
      to: process.env.RECEIVER_EMAIL,
      subject: "BC Agent Excel Data",
      html: `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
      <p>Hi Team,</p>

      <p>
        Please find the attached data for the 
        <strong>AEPS</strong> and <strong>MATM</strong> services required for the onboarding process.
      </p>

      <p>
        If you require any further information, please feel free to reach out.
      </p>

      <br/>

      <p>
        Thanks & Regards,<br/>
        <strong>Seven Tech Solutions Pvt. Ltd.</strong>
      </p>
    </div>
  `,
      attachments: [
        {
          filename: `bc-agent-${Date.now()}.xlsx`,
          content: buffer,
        },
      ],
    });
    await userModel.updateOne(
      { _id: userId },
      {
        $set: {
          isOnBoardEmailSend: true,
        },
      }
    );

    return res.json({
      success: true,
      message: "Onboarding mail sent successfully Thank You!",
    });
  } catch (error) {
    console.error("SECURE SMTP ERROR:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error while sending email",
    });
  }
};

exports.updateIsOnBoardStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can update onboarding status",
      });
    }

    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { isOnBoard } = req.body;

    if (typeof isOnBoard !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isOnBoard must be a boolean (true/false)",
      });
    }

    const user = await userModel.findById(userId).select("_id isOnBoard");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isOnBoard === isOnBoard) {
      return res.status(400).json({
        success: false,
        message: `User is already ${isOnBoard ? "onboarded" : "not onboarded"}`,
      });
    }

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            isOnBoard,
          },
        },
        { new: true }
      )
      .select("_id name email isOnBoard");

    return res.status(200).json({
      success: true,
      message: `User successfully ${
        isOnBoard ? "onboarded" : "deactivated from onboarding"
      }`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("ERROR in updateIsOnBoardStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating onboarding status",
    });
  }
};
