const { default: axios } = require("axios");
const CryptoJS = require("crypto-js");
require("dotenv").config();
const XLSX = require("xlsx");

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
const mapUserToExcel = ({ ...user }) => {
  return {
    bcagentid: user?.UserId || "",
    bcagentname: user?.name || "",
    lastname: user?.name?.split(" ").slice(-1)[0] || "",
    companyname: user?.shopName || "",
    address: user?.address?.block || "",
    area: user?.address?.block || "",
    pincode: user?.pinCode || "",
    mobilenumber: user.mobileNumber || "",
    shopname: user.shopName || "",
    shopaddress: user?.address?.block || "",
    shopstate: user?.address?.state || "",
    shopcity: user.address?.city || "",
    shopdistrict: user?.aadharDetails?.data?.address?.dist || "",
    shoppincode: user.pincode || "",
    pancard: user.panDetails?.pan_number || "",
    email: user.email || "",
    aadhaar: user?.aadharDetails?.data?.aadhaar_number || "",
    lat: user.latitude || "",
    long: user.longitude || "",
    apiusername: user.apiUsername || "",
  };
};

exports.sendAepsExcelMail = async (req, res) => {
  try {
    const { user } = req.body;

    if (!user) {
      return res.status(400).json({ message: "User data missing" });
    }
    // console.log("User Data for AEPS Excel Mail:", user);

    // 1️⃣ Excel Row
    const excelData = [mapUserToExcel(user)];
    // console.log("Mapped Excel Data:", excelData);
    // return;

    // 2️⃣ Excel Sheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AEPS_DATA");

    // 3️⃣ Excel buffer → base64 convert
    const excelBuffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    });

    const excelBase64 = excelBuffer.toString("base64");

    // 4️⃣ Prepare Msg91 Payload
    const payload = {
      recipients: [
        {
          to: [
            {
              name: "Admin",
              email: "niranjan@7unique.in",
            },
          ],
          variables: {
            company_name: "SevenUnique Tech Solutions Pvt Ltd",
            name: user.name,
            login_time: new Date().toISOString(),
          },
        },
      ],
      from: {
        name: "SevenUnique",
        email: "info@sevenunique.com",
      },
      domain: "mail.sevenunique.com",
      // template_id: "global_otp",

      attachments: [
        {
          name: "AEPS_User_onboarding_Data.xlsx",
          content: excelBase64,
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    };

    // 5️⃣ Send Email via Msg91
    try {
      const response = await axios.post(
        "https://control.msg91.com/api/v5/email/send",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            authkey: "415386Amp14kbEfs65c49c94P1",
          },
        }
      );

      return res.json({
        message: "AEPS Excel Email Sent!",
        response: response.data,
      });
    } catch (error) {
      console.error("Error sending AEPS Excel Mail:", error);
      return res.status(500).json({ message: "sending AEPS Excel Mail" });
    }
  } catch (err) {
    console.log("Failed to send AEPS mail", err);
    res.status(500).json({ message: "Failed to send AEPS mail" });
  }
};
