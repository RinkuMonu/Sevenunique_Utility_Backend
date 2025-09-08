// services/rechargeService.js

const axios = require("axios");
const secretKey = "abcd@123";
const crypto = require("crypto");


const MOBIKWIK_API_URL = "https://alpha3.mobikwik.com/rechargeStatus.do";
const MOBIKWIK_BALANCE_API_URL =
  "https://alpha3.mobikwik.com/recharge/v1/retailerBalance";
const MOBIKWIK_view_bill_URL =
  " https://alpha3.mobikwik.com/retailer/v2/retailerViewbill";
const UID = "testalpha1@gmail.com";
const PWD = "testalpha1@123";

 const checkRechargeStatus = async (txId) => {
  try {
    const url = `${MOBIKWIK_API_URL}?uid=${UID}&pwd=${PWD}&txId=${txId}`;
    const response = await axios.get(url);
    //console.log(response.data);
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch recharge status");
  }
};
 const checkRetailerBalance = async () => {
  try {
    const requestBody = {
      uid: "testalpha1@gmail.com",
      password: "testalpha1@123",
      memberId: "testalpha1@gmail.com",
    };

    const response = await axios.post(MOBIKWIK_BALANCE_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch retailer balance");
  }
};
 const viewbill = async ({ cir, cn, op }) => {
  console.log("sdddddddddd", cir, cn, op);

  try {
    const requestBody = {
      adParams: {},
      uid: "testalpha1@gmail.com",
      pswd: "testalpha1@123",
      cir: cir,
      cn: cn,
      op: op,
      agentCode: "XXXX",
      initiatingChannel: "XX",
      terminalId: "XX",
      geocode: "XXXX",
      postalCode: "XX",
      agentMobile: "XX",
    };

    const response = await axios.post(MOBIKWIK_view_bill_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-MClient": "14",
      },
    });
    console.log("dfghjkl",response.data);
    return response.data;
  } catch (error) {
    console.error("API Error:", error.response?.data || error.message);
    throw new Error("Failed to fetch retailer balance");
  }
};

 const rechargeValidation = async ({ uid, password, amt, cir, cn, op }) => {
  const url = "https://alpha3.mobikwik.com/recharge/v1/retailerValidation";

  const plainText = `{"uid":"${uid}","password":"${password}","amt":"${amt}","cir":"${cir}","cn":"${cn}","op":"${op}","adParams":{}}`;
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

// Function to make the recharge request to Mobikwik API
const recharge = async (uid, pwd, cn, op, cir, amt, reqid) => {
  const url = `https://alpha3.mobikwik.com/recharge.do?uid=${uid}&pwd=${pwd}&cn=${cn}&op=${op}&cir=${cir}&amt=${amt}&reqid=${reqid}`;

  try {
    // Make the GET request to Mobikwik API
    const response = await axios.get(url);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error in recharge service:", error);
    throw error;
  }
};

module.exports = {
  rechargeValidation,
  recharge,
  checkRechargeStatus,
  checkRetailerBalance,
  viewbill,
};