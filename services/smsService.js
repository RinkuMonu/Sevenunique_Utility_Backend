const axios = require("axios");

const sendOtp = async (mobileNumber, otp, type) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templatedForRegisteer = process.env.MSG91_TEMPLATE_ID_N_REG; // defalut
    const templateIdForLogREG = process.env.MSG91_TEMPLATE_ID_FOR_LOG; // defalut
    const templateIdForForgot_password = process.env.MSG91_TEMPLATE_ID_FOR_FORGET_PASWORD;
    const templateIdForReset_MPIN = process.env.MSG91_TEMPLATE_ID_FOR_RESET_MPIN;

    if (!authKey) {
      console.error("Missing MSG91 Auth Key or Template ID");
      throw new Error("MSG91 Auth Key or Template ID is missing");
    }
    let templateId = templateIdForLogREG;
    if (type === "password") {
      templateId = templateIdForForgot_password;
    }
    else if (type === "mpin") {
      templateId = templateIdForReset_MPIN;
    }
    else if (type === "login") {
      templateId = templateIdForLogREG;
    } else if (type === "register") {
      templateId = templatedForRegisteer;
    }
    else {
      templateId = templateIdForLogREG;
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
    // console.log(response)
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

// module.exports = { sendOtp };


// const sendOtp = async (mobileNumber, otp) => {
//   try {
//     const response = await axios.post(
//       "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
//       {
//         integrated_number: "15558617631", 
//         content_type: "template",
//         payload: {
//           messaging_product: "whatsapp",
//           type: "template",
//           template: {
//             name: "testing",
//             language: {
//               code: "en",
//               policy: "deterministic",
//             },
//             namespace: "8110cd2b_ad05_4db5_9e8e_5850ba1aeaa3",
//             to_and_components: [
//               {
//                 to: [`91${mobileNumber}`],
//                 components: {
//                   body_1: {
//                     type: "text",
//                     value: otp,
//                   },
//                   button_1: {
//                     subtype: "url",
//                     type: "text",
//                     value: otp
//                   }
//                 },
//               },
//             ],
//           },
//         },
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           authkey: process.env.MSG91_AUTH_KEY,
//         },
//       }
//     );

//     console.log("WhatsApp OTP Response:", response.data);
//     return {
//       success: true,
//       requestId: response.data.request_id,
//     };
//   } catch (error) {
//     console.error("WhatsApp OTP Error:", error?.response?.data || error.message);
//     return { success: false };
//   }
// };

module.exports = { sendOtp };
