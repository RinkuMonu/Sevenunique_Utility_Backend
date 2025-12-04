const axios = require("axios");
const { encrypt, decrypt } = require("../../utils/encryption");
const crypto = require("crypto");
const { sendOtp } = require("../../services/smsService.js");

// ✅ Global variable to store requestId
let globalRequestId = null;

const workingKey = process.env.ENCRYPTION_KEY;
const BBPS_API_URL = process.env.BBPS_API_URL;
const ACCESS_CODE = process.env.ACCESS_CODE;


// ✅ Generate unique requestId in required format
function generateRequestId() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomPart = "";
  for (let i = 0; i < 27; i++) {
    randomPart += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  const now = new Date();
  const year = now.getFullYear() % 10;
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");

  const requestId = `${randomPart}${year}${dayOfYear
    .toString()
    .padStart(3, "0")}${hours}${minutes}`;
  return requestId;
}

// ✅ Encrypted API (biller-info-enc)
const billerInfo = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    // ✅ Parse raw string to JSON if coming as raw text
    const requestBody = JSON.parse(req.body);
    if (!requestBody.billerId || !Array.isArray(requestBody.billerId)) {
      return res.status(400).json({ error: "Invalid billerId format" });
    }

    const billerData = JSON.stringify(requestBody);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extMdmCntrl/mdmRequestNew/json",
      encryptedData,
      {
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const billFetch = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    // const requestBody = JSON.parse(req.body);

    const billerData = JSON.stringify(req.body);

    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Generate and store requestId in global variable
    globalRequestId = generateRequestId();
    console.log("✅ Request ID stored globally:", globalRequestId);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extBillCntrl/billFetchRequest/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: globalRequestId,
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const billpayment = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);


    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    if (!globalRequestId) {
      console.warn("⚠️ No requestId found. Generating new requestId.");
      globalRequestId = generateRequestId(); // Fallback if no requestId found
    }

    console.log("✅ Using Request ID:", globalRequestId);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extBillPayCntrl/billPayRequest/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: globalRequestId,
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const transactionstatus = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/transactionStatus/fetchInfo/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};



const sendMessage = async (mobileNumber, message) => {
  try {
    const apiKey = process.env.FLASH2SMS_API_KEY;
    const senderId = process.env.FLASH2SMS_SENDER_ID;

    if (!apiKey || !senderId) {
      console.error("Missing API Key or Sender ID");
      throw new Error("Fast2SMS API key or Sender ID is missing");
    }

    const params = {
      route: "q",  // Change route if needed (e.g., "dlt")
      sender_id: senderId,
      message,
      language: "english",
      numbers: mobileNumber,
    };

    // Sending the message through Fast2SMS API
    const response = await axios.post("https://www.fast2sms.com/dev/bulkV2", params, {
      headers: {
        authorization: apiKey  // API key in the header
      }
    });

    if (response.data.return) {
      return { success: true, message: "Message sent successfully" };
    } else {
      const errorMessage = response.data.message || "Failed to send message";
      return { success: false, message: errorMessage };
    }
  } catch (error) {
    if (error.response) {
      console.error("Error in sendMessage - Response Error:", error.response.data);
      return { success: false, message: error.response.data.message || "Failed to send message" };
    } else {
      console.error("Error in sendMessage - General Error:", error.message);
      return { success: false, message: "Error sending message" };
    }
  }
};

const complaintregistration = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API for complaint registration
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extComplaints/register/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);

    // Parsing decrypted response
    const responseData = JSON.parse(decryptedData);

    // Handling the success response from BBPS API
    if (responseData.complaintResponseCode === "001") {
      const complaintId = responseData.errorInfo.error[0].errorMessage.split(":")[1].trim(); // Extract complaint ID
      const txnRefId = req.body.txnRefId;  // Extract txnRefId from request body
      const mobileNumber = req.body.mobileNumber;  // Mobile number from request body (Assumed field)

      // Generate the customer message
      const customerMessage = `Dear customer, your complaint has been registered successfully for txn ref id ${txnRefId}, and you can track your complaint id using your complaint id: ${complaintId}.`;

      // Send the customer message using the sendMessage function
      const messageResponse = await sendMessage(mobileNumber, customerMessage);

      // Send response back to the client
      return res.json({
        success: true,
        message: customerMessage,
        messageResponse: messageResponse,  // Send message response as part of the response
      });
    } else {
      return res.status(400).json({
        success: false,
        message: responseData.errorInfo.error[0].errorMessage || "Failed to register the complaint",
      });
    }

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};


const complainttracking = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extComplaints/track/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );


    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const billvalidation = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extBillValCntrl/billValidationRequest/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const plan = async (req, res) => {
  try {
    console.log("Received Request Body:", req.body);

    const billerData = JSON.stringify(req.body);
    console.log("Validated Request Data:", billerData);

    // ✅ Encrypt stringified data
    const encryptedData = encrypt(billerData, workingKey);
    console.log("Encrypted Data:", encryptedData);

    // ✅ Send encrypted data to BBPS API
    const bbpsResponse = await axios.post(
      "https://stgapi.billavenue.com/billpay/extPlanMDM/planMdmRequest/json",
      null, // No body, params go in `params`
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          accessCode: ACCESS_CODE,
          requestId: generateRequestId(),
          ver: "1.0",
          instituteId: "FP09",
          encRequest: encryptedData,
        },
      }
    );

    console.log("BBPS Response:", bbpsResponse.data);

    if (!bbpsResponse.data) {
      return res.status(400).json({ error: "Invalid response from BBPS API" });
    }

    // ✅ Decrypt response data
    const decryptedData = decrypt(bbpsResponse.data, workingKey);
    console.log("Decrypted Data:", decryptedData);
    res.json(JSON.parse(decryptedData));
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  billerInfo,
  billFetch,
  billpayment,
  transactionstatus,
  complaintregistration,
  complainttracking,
  billvalidation,
  plan,
};