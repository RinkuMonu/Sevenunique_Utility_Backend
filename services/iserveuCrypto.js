const crypto = require("crypto");

const key = Buffer.from(process.env.ISU_AES_KEY_BASE64, "base64"); // 32 bytes

if (!key || key.length !== 32) {
  throw new Error("Invalid ISU_AES_KEY_BASE64 (must be base64 of 32-byte key)");
}

function encryptObject(obj) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const out = Buffer.concat([iv, enc]);         // IV || CIPHERTEXT
  return out.toString("base64");
}

function decryptToObject(base64) {
  const buf = Buffer.from(base64, "base64");
  const iv = buf.subarray(0, 16);
  const enc = buf.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8").trim();

  // remove noise beyond last } or ]
  const lastBrace = Math.max(dec.lastIndexOf("}"), dec.lastIndexOf("]"));
  const clean = lastBrace !== -1 ? dec.slice(0, lastBrace + 1) : dec;
  return JSON.parse(clean);
}

function buildHeaderSecrets() {
  const epoch = Math.floor(Date.now() / 1000).toString(); // seconds
  const headerJson = {
    client_id: process.env.ISU_CLIENT_ID,
    client_secret: process.env.ISU_CLIENT_SECRET,
    epoch,
  };
  return encryptObject(headerJson);
}

module.exports = {
  encryptObject,
  decryptToObject,
  buildHeaderSecrets,
};
