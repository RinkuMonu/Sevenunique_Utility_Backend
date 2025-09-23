const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateJwtToken = (userId, role, mobileNumber) => {
  try {
    const payload = {
      id: userId,
      role,
      mobileNumber
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    return token;
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw new Error('Failed to generate token');
  }
};

function encryptPidData(piddata, key, iv) {
  // Auto-detect hex vs utf8
  let keyBuf, ivBuf;
  if (key.length === 32) {
    keyBuf = Buffer.from(key, "hex");
  } else {
    keyBuf = Buffer.from(key, "utf8");
  }

  if (iv.length === 32) {
    ivBuf = Buffer.from(iv, "hex");
  } else {
    ivBuf = Buffer.from(iv, "utf8");
  }

  console.log("🔑 Key length:", keyBuf.length, "IV length:", ivBuf.length);

  const cipher = crypto.createCipheriv("aes-128-cbc", keyBuf, ivBuf);
  const raw = Buffer.concat([cipher.update(piddata, "utf8"), cipher.final()]);
  return raw.toString("base64");
}





module.exports = { generateJwtToken, encryptPidData };
