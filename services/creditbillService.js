const axios = require("axios");
const secretKey = "abcd@123";
const crypto = require("crypto");
const { encryptCreditCard } = require("../utils/encryptrsa");
const { json } = require("body-parser");

const rechargeValidation = async ({ uid, password, amt, cir, cn, op }) => {
  const url = "https://alpha3.mobikwik.com/recharge/v1/retailerValidation";

  const encryptedCn = encryptCreditCard(cn);
  //console.log("encrypted cn", encryptedCn);

  const plainText = `{"uid":"${uid}","password":"${password}","amt":"${amt}","cir":"${cir}","cn":"${encryptedCn}","op":"${op}","adParams":{}}`;
  //console.log("dfghj", plainText);

  function generateChecksum(plainText) {
    const hmac = crypto.createHmac("sha256", "abcd@123");
    hmac.update(plainText);
    return hmac.digest("base64");
  }
  const checksum = generateChecksum(plainText);
  //console.log("checksum", checksum);

  const headers = {
    "X-MClient": "14",
    "Content-Type": "application/json",
    checkSum: checksum,
  };

  try {
    const response = await axios.post(url, plainText, { headers });

    //console.log("status: ", response.status, " data:", response.data);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error while calling recharge API:", error);
    return {
      status: error.response?.status || 500,
      data: error.response?.data || { message: "API request failed" },
    };
  }
};


const rechargeviewbill = async ({ uid, password, mobile, last4, encrypted_card }) => {
  const url = "https://alpha3.mobikwik.com/retailer/v2/retailerCCBill";

  // Encrypt the card information
  const encryptedCn = encryptCreditCard(encrypted_card);
  //console.log("encrypted cn", encryptedCn);

  // Prepare the data as parameters
  const params = JSON.stringify({
    uid,
    password,
    last4,
    mobile,
    encrypted_card: encryptedCn
  });

  //console.log("params", params);

  const headers = {
    "X-MClient": "14",
    "Content-Type": "application/json",
  };

  try {
    // Send the data using parameters, not the body
    const response = await axios.post(url, params, { headers });
    //console.log("response", response);
    //console.log("status:", response.status, " data:", response.data);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error while calling recharge API:", error);
    return {
      status: error.response?.status || 500,
      data: error.response?.data || { message: "API request failed" },
    };
  }
};


const recharge = async (uid, pwd, cn, op, cir, amt, reqid, ad9) => {
  const url = `https://alpha3.mobikwik.com/recharge.do?uid=${uid}&pwd=${pwd}&cn=${cn}&op=${op}&cir=${cir}&amt=${amt}&reqid=${reqid}&ad9=${ad9}`


  try {
    // Make the GET request to Mobikwik API
    const response = await axios.get(url);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error in recharge service:", error);
    throw error;
  }
};

module.exports = { rechargeValidation, rechargeviewbill, recharge };
