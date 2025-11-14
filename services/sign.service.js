const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

exports.signEncryptedRequest = (encryptedRequest) => {
    const privateKeyPath = path.join(__dirname, "../certs/private_key.pem");
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(encryptedRequest);
    signer.end();

    const signature = signer.sign(privateKey, "base64");
    return signature;
};
