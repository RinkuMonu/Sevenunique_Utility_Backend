const crypto = require("crypto");
const fs = require('fs');


function generateKeyPair() {
    // Check if the keys already exist
    if (fs.existsSync("public.pem") && fs.existsSync("private.pem")) {
        // //console.log("🔒 RSA Key Pair already exists!");
        return; // Exit the function if keys already exist
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048, // Strong security ke liye 2048-bit key
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Save keys to .pem files
    fs.writeFileSync("public.pem", publicKey);
    fs.writeFileSync("private.pem", privateKey);
    //console.log("✅ RSA Key Pair Generated & Saved!");
}

// Call the function to generate keys (only if not already present)
generateKeyPair();


//  2. Encrypt Function (Credit Card Data)
const encryptCreditCard  = (creditCardNumber) =>{
    const publicKey = fs.readFileSync("public.pem", "utf8");

    const encryptedData = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        Buffer.from(creditCardNumber)
    );

    return encryptedData.toString("base64");
}

// 🛠️ 3. Decrypt Function (Original Card Number Wapas Laane Ke Liye)
const decryptCreditCard = (encryptedData) =>{
    const privateKey = fs.readFileSync("private.pem", "utf8");

    const decryptedData = crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        Buffer.from(encryptedData, "base64")
    );

    return decryptedData.toString();
}

// 🚀 TEST
const creditCard = "4111-1111-1111-1111"; // Sample Credit Card Number
// //console.log("💳 Original Credit Card:", creditCard);

const encryptedCard = encryptCreditCard(creditCard);
// //console.log("🔒 Encrypted Credit Card:", encryptedCard);

const decryptedCard = decryptCreditCard(encryptedCard);
// //console.log("🔓 Decrypted Credit Card:", decryptedCard);


module.exports = {encryptCreditCard, decryptCreditCard};