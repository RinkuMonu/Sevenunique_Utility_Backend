require("dotenv").config();
const axios = require("axios");
const createError = require("http-errors");
const Joi = require("joi");
const xml2js = require("xml2js");
const crypto = require("crypto");

const instantpay = axios.create({
  baseURL: "https://api.instantpay.in",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    "X-Ipay-Client-Id":"YWY3OTAzYzNlM2ExZTJlOWYKV/ca1YupEHR5x0JE1jk=",
    "X-Ipay-Client-Secret":"9fd6e227b0d1d1ded73ffee811986da0efa869e7ea2d4a4b782973194d3c9236",
    "X-Ipay-Auth-Code": "1",
    "X-Ipay-Outlet-Id":"562881", 
    "X-Ipay-Endpoint-Ip": "2401:4900:1c1a:3375:79e6:7c23:63b2:2221",
  },
});

// Helpers
function normalizePayloadForEnquiry(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}

function normalizePayloadForPayment(body) {
  return {
    ...body,
    initChannel: body.initChannel || "AGT",
    deviceInfo: {
      ip: "103.254.205.164",
      mac: "BC-BE-33-65-E6-AC",
      geoCode: "28.6139,77.2090",
      ...(body.deviceInfo || {}),
    },
    paymentMode: body.paymentMode || "Cash",
    paymentInfo: body.paymentInfo || { Remarks: "CashPayment" },
    remarks: body.remarks || { param1: body.inputParameters?.param1 },
  };
}


// Helper function (normal bana do)
async function parsePidXML(pidXml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(pidXml, { explicitArray: true }, (err, result) => {
      if (err) return reject(err);

      try {
        const resp = result.PidData.Resp[0];
        const deviceInfo = result.PidData.DeviceInfo[0];
        const skey = result.PidData.Skey[0];
        const hmac = result.PidData.Hmac[0];
        const data = result.PidData.Data[0];

        // extract additional_info Params
        let params = {};
        if (deviceInfo.additional_info && deviceInfo.additional_info[0].Param) {
          deviceInfo.additional_info[0].Param.forEach((p) => {
            params[p.$.name] = p.$.value;
          });
        }

        resolve({
          dc: deviceInfo.$.dc,
          dpId: deviceInfo.$.dpId,
          rdsId: deviceInfo.$.rdsId,
          rdsVer: deviceInfo.$.rdsVer,
          mi: deviceInfo.$.mi,
          mc: deviceInfo.$.mc,
          ci: skey.$.ci,
          sessionKey: skey._,
          hmac: hmac,
          pidDataType: data.$.type,
          pidData: data._,
          errCode: resp.$.errCode,
          errInfo: resp.$.errInfo,
          fCount: resp.$.fCount || "0",
          fType: resp.$.fType || "0",
          iCount: resp.$.iCount || "0",
          pCount: resp.$.pCount || "0",
          qScore: resp.$.qScore || "",
          nmPoints: resp.$.nmPoints || "",
          srno: params.srno || "",
          sysid: params.sysid || "",
          ts: params.ts || "",
          modality_type: params.modality_type || "",
          device_type: params.device_type || "",
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}





function encrypt(text, key) {
    const encryptionKey = Buffer.from(key); // 32 bytes
    const algorithm = "aes-256-cbc";
    const iv = crypto.randomBytes(16); // 16 bytes IV
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    // IV ko bhi attach kar dete hain (Base64 me safe transfer ke liye)
    const encryptedData = Buffer.concat([iv, Buffer.from(encrypted, "base64")]).toString("base64");
    return encryptedData;
}

exports.outletRegister = async (req, res, next) => {
  try {
    const schema = Joi.object({
      mobile: Joi.string().length(10).required(),
      email: Joi.string().email().required(),
      aadhaar: Joi.string().length(12).required(),
      pan: Joi.string().length(10).required(),
      shopName: Joi.string().required(),
      address: Joi.string().required(),
      pincode: Joi.string().length(6).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) throw createError(400, error.details[0].message);

    const response = await instantpay.post("/fi/outlet/register", value);
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Register Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLoginStatus = async (req, res, next) => {
  try {
    const { outletId } = req.body;
    if (!outletId) throw createError(400, "OutletId required");

    const response = await instantpay.post("/fi/outlet/login/status", { outletId });
    return res.json(response.data);
  } catch (err) {
    console.error("Outlet Login Status Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.outletLogin = async (req, res, next) => {
  try {
    const { outletId, aadhaar, pidData } = req.body;
    console.log("📥 Incoming Outlet Login Request:", req.body);

    if (!outletId || !aadhaar || !pidData) throw createError(400, "Missing parameters");

    // Aadhaar encrypt
    const encryptedAadhaar = encrypt(aadhaar, "efb0a1c3666c5fb0efb0a1c3666c5fb0");

    // Parse PID XML to biometricData object
    const biometricParsed = await parsePidXML(pidData);

    const payload = {
      type: "DAILY_LOGIN",
      latitude: "26.79900",
      longitude: "75.86500",
      externalRef: "REF" + Date.now(),
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        
      },
    };

    console.log("📤 Final Outlet Login Payload:", JSON.stringify(payload, null, 2));

    const response = await instantpay.post("/fi/aeps/outletLogin", payload);
    console.log("✅ Outlet Login Response:", response.data);

    return res.json(response.data);
  } catch (err) {
    console.error("❌ Outlet Login Error:", err.response?.data || err.message);
    next(err);
  }
};





exports.cashWithdrawal = async (req, res) => {
  try {
    const {
      aadhaar,
      bankiin,
      latitude,
      longitude,
      mobile,
      amount,
      pidData,
    } = req.body;

    // Aadhaar encrypt
    const encryptedAadhaar = encrypt(aadhaar,"efb0a1c3666c5fb0efb0a1c3666c5fb0");

    // PID XML parse (maan lo tumhare pass parsePidXML() hai)
    const biometricParsed = await parsePidXML(pidData);

    const payload = {
     type: "DAILY_LOGIN",
      bankiin,
      latitude: "26.79900",
      longitude: "75.86500",
      mobile,
      amount: String(amount),
      externalRef: "REF" + Date.now(),
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };


 const response = await instantpay.post("/fi/aeps/cashWithdrawal", payload);
    

    res.json(response.data);
  } catch (err) {
    console.error("Cash Withdrawal Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Cash Withdrawal failed", details: err.response?.data || err.message });
  }
};

exports.balanceEnquiry = async (req, res, next) => {
  try {
    const { aadhaar, bankiin, mobile, pidData } = req.body;
    if (!aadhaar || !bankiin || !mobile || !pidData) throw createError(400, "Missing required fields");
    const biometricParsed = await parsePidXML(pidData);
     const encryptedAadhaar = encrypt(aadhaar,"efb0a1c3666c5fb0efb0a1c3666c5fb0");
  const payload = {
     type: "DAILY_LOGIN",
      bankiin,
      latitude: "26.79900",
      longitude: "75.86500",
      mobile,
     
      externalRef: "REF" + Date.now(),
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };

    const response = await instantpay.post("/fi/aeps/balanceInquiry", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Balance Enquiry Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.miniStatement = async (req, res, next) => {
  try {
    const { aadhaar, bankiin, mobile, pidData } = req.body;
    if (!aadhaar || !bankiin || !mobile || !pidData) throw createError(400, "Missing required fields");
    const biometricParsed = await parsePidXML(pidData);
     const encryptedAadhaar = encrypt(aadhaar,"efb0a1c3666c5fb0efb0a1c3666c5fb0");
   const payload = {
     type: "DAILY_LOGIN",
      bankiin,
      latitude: "26.79900",
      longitude: "75.86500",
      mobile,
     
      externalRef: "REF" + Date.now(),
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };

    const response = await instantpay.post("/fi/aeps/miniStatement", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Mini Statement Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.deposite = async (req, res, next) => {
  try {
    const { aadhaar, bankiin, mobile,amount, pidData } = req.body;
    if (!aadhaar || !bankiin || !mobile || !pidData) throw createError(400, "Missing required fields");
    const biometricParsed = await parsePidXML(pidData);
     const encryptedAadhaar = encrypt(aadhaar,"efb0a1c3666c5fb0efb0a1c3666c5fb0");
   const payload = {
     type: "DAILY_LOGIN",
      bankiin,
      latitude: "26.79900",
      longitude: "75.86500",
      mobile,
     amount,
      externalRef: "REF" + Date.now(),
      captureType: "FINGER",
      biometricData: {
        encryptedAadhaar,
        ...biometricParsed,
        iCount: biometricParsed.iCount || "0",
        pCount: biometricParsed.pCount || "0",
      },
    };

    const response = await instantpay.post("/fi/aeps/cashDeposit", payload);
    return res.json(response.data);
  } catch (err) {
    console.error("Mini Statement Error:", err.response?.data || err.message);
    next(err);
  }
};
exports.getBankList = async (req, res, next) => {
  try {
    const response = await instantpay.get("/fi/aeps/banks");
    return res.json(response.data);
  } catch (err) {
    console.error("Bank List Error:", err.response?.data || err.message);
    next(err);
  }
};
