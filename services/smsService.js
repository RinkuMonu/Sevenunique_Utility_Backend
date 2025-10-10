const axios = require("axios");

const sendOtp = async (mobileNumber, otp) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY; 
    const templateId = process.env.MSG91_TEMPLATE_ID; 

    if (!authKey || !templateId) {
      console.error("Missing MSG91 Auth Key or Template ID");
      throw new Error("MSG91 Auth Key or Template ID is missing");
    }

    const payload = {
      template_id: templateId,
      recipients: [
        {
          mobiles: "91" + mobileNumber,
          OTP: otp,
          name: "User",
        },
      ],
    };

    const response = await axios.post(
      "https://control.msg91.com/api/v5/flow",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          authkey: authKey,
        },
      }
      
    );
    console.log(response)
    if (response.data.type === "success") {
      return { success: true, message: "OTP sent successfully" };
    } else {
      const errorMessage = response.data.message || "Failed to send OTP";
      return { success: false, message: errorMessage };
    }
  } catch (error) {
    if (error.response) {
      console.error("Error in sendOtp - Response Error:", error.response.data);
      return {
        success: false,
        message: error.response.data.message || "Failed to send OTP",
      };
    } else {
      console.error("Error in sendOtp - General Error:", error.message);
      return { success: false, message: "Error sending OTP" };
    }
  }
};

module.exports = { sendOtp };

// const axios = require("axios");

// const sendOtp = async (mobileNumber, otp) => {
//   try {
//     const apiKey = process.env.FLASH2SMS_API_KEY;
//     const senderId = process.env.FLASH2SMS_SENDER_ID;
//     const message = `Dear user, Your OTP for login is ${otp} Do not share with anyone -Finunique Small Pvt. Ltd.`;

//     if (!apiKey || !senderId) {
//       console.error("Missing API Key or Sender ID");
//       throw new Error("Fast2SMS API key or Sender ID is missing");
//     }

//     const params = {
//       // authorization: apiKey,
//       route: "q",  // Change route if needed (e.g., "dlt")
//       sender_id: senderId,
//       message,
//       language: "english",
//       numbers: mobileNumber,
//     };

//     //console.log("Fast2SMS Request Params:", params);  // Debugging log

//     const response = await axios.post("https://www.fast2sms.com/dev/bulkV2", params, {
//       headers: {
//         authorization: apiKey  // API key in the header
//       }
//       });
//     //console.log("Fast2SMS Response:", response.data);

//     if (response.data.return) {
//       return { success: true, message: "OTP sent successfully" };
//     } else {
//       // Provide a more detailed error message
//       const errorMessage = response.data.message || "Failed to send OTP";
//       return { success: false, message: errorMessage };
//     }
//   } catch (error) {
//     if (error.response) {
//       console.error("Error in sendOtp - Response Error:", error.response.data);
//       return { success: false, message: error.response.data.message || "Failed to send OTP" };
//     } else {
//       console.error("Error in sendOtp - General Error:", error.message);
//       return { success: false, message: "Error sending OTP" };
//     }
//     // console.error("Error in sendOtp:", error.response?.data || error.message);
//     // return { success: false, message: "Error sending OTP" };
//   }
// };

// module.exports = { sendOtp };
