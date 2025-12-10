import "dotenv/config";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import generatePaysprintJWT from "../../services/Dmt&Aeps/TokenGenrate.js";

function getPaysprintHeaders() {
  const jwtToken = generatePaysprintJWT();

  console.log("Generated JWT nEw:", jwtToken);
  return {
    Authorization: `Bearer ${jwtToken}`,
    Token: `${jwtToken}`,
    "Content-Type": "application/json",
    authorisedkey:  process.env.PAYSPRINT_AUTH_KEY,
  };
}

export const creditCard = async (req, res) => {
  const headers = getPaysprintHeaders();
  console.log("Generated JWT headers:", headers);
  try {
    const refid = uuidv4();
    const merchantcode = process.env.PAYSPRINT_MERCHANT_CODE;
    const data = {
      refid,
      merchantcode,
    };
    console.log("Generated JWT headers data:", data); // Debug the data

    // Make the API call to PaySprint with the correct headers
    const response = await axios.post(
      "https://sit.paysprint.in/service-api/api/v1/service/lead/creditcard/get_utm",
      data,
      { headers }
    );

    console.log(response, "response");
    if (response.data || response.data.utmLink) {
      return res.status(200).json({
        data: response?.data,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Failed to generate UTM link",
    });
  } catch (error) {
    console.error("Error in generating UTM:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
