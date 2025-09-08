
const OTP = require("../models/otpModel");


const generateOtp = async (mobileNumber) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    // Remove existing OTPs before creating a new one
    await OTP.deleteMany({ mobileNumber });
    await OTP.create({ mobileNumber, otp });
    return otp;
  } catch (error) {
    console.error("Error generating OTP:", error);
    throw new Error("Failed to generate OTP");
  }

};
  const verifyOtp = async (mobileNumber, otp) => {                                        
    try {
      const existingOtp = await OTP.findOne({ mobileNumber, otp });
  
      if (!existingOtp) {
        return { success: false, message: "Invalid or expired OTP" };
      }
  
      // Remove OTP after successful verification
      await OTP.deleteMany({ mobileNumber });
  
      return { success: true, message: "OTP verified successfully" };
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return { success: false, message: "Failed to verify OTP" };
    }
};

module.exports = { generateOtp, verifyOtp }; // Ensure this export is correct
 
