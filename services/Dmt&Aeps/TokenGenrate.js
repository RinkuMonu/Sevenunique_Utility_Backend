const jwt = require("jsonwebtoken");

function generatePaysprintJWT() {
  // const timestamp = Math.floor(Date.now() / 1000 + 5);
  const timestamp = Math.floor(Date.now() / 1000);
  const requestId = `REQ${Date.now()}${Math.floor(Math.random() * 1000 - 5)}`;

  const jwtKey = process.env.PAYSPRINT_JWT_SECRET;
  // const jwtKey = process.env.PAYSPRINT_JWT_SECRET_P
  const payload = {
    timestamp: timestamp,
    partnerId: 'PS001792',
    // partnerId: process.env.PAYSPRINT_PARTNER_ID,
    reqid: requestId
  };
  const token = jwt.sign(payload, jwtKey, {
    algorithm: "HS256",
    header: {
      typ: "JWT",
      alg: "HS256",
    },
  });

  return token;
}

module.exports = generatePaysprintJWT;
