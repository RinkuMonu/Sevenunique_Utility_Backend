const crypto = require('crypto');

// ✅ Working Key (same as PHP key)
const workingKey = '6743D700ED335785E47D882027B283C0';

// ✅ Function to convert hex to binary (hextobin equivalent in PHP)
function hexToBin(hexString) {
    return Buffer.from(hexString, 'hex');
}

// ✅ Encryption Function
function encrypt(plainText, key) {
    // Use MD5 hash of the key and convert to binary (16-byte key for AES-128)
    const encryptionKey = hexToBin(crypto.createHash('md5').update(key).digest('hex'));

    // Fixed Initialization Vector (IV) same as PHP
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);

    // Create a cipher using AES-128-CBC
    const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);

    // Encrypt the plain text
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted.toUpperCase();
}

// ✅ Decryption Function
function decrypt(encryptedText, key) {
    // Use MD5 hash of the key and convert to binary
    const decryptionKey = hexToBin(crypto.createHash('md5').update(key).digest('hex'));

    // Fixed Initialization Vector (IV)
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);

    // Create a decipher using AES-128-CBC
    const decipher = crypto.createDecipheriv('aes-128-cbc', decryptionKey, iv);

    // Decrypt the encrypted text
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// ✅ Example Usage

// const billerData = JSON.stringify("Hello World");
// console.log("➡️ Original Biller Data:", billerData);

// // // Encrypt the data
// const encryptedBillerData = encrypt(billerData, workingKey);
// console.log("🔐 Encrypted Biller Data:", encryptedBillerData);

// // Decrypt the data
// try {
//     const decryptedBillerData = decrypt(encryptedBillerData, workingKey);

//     console.log("🔓 Decrypted Biller Data:", decryptedBillerData);
// } catch (error) {
//     console.error("❌ Decryption Failed:", error.message);
// }

// ✅ Export encryption and decryption functions
module.exports = { encrypt, decrypt };