const crypto = require('crypto');

// Function to generate checksum
const generateChecksum = (params, secretKey) => {
    // Step 1: Sort keys and create a string
    const sortedKeys = Object.keys(params).sort(); // Sort keys lexicographically
    let checksumString = '';

    // Step 2: Build the query string with sorted parameters
    sortedKeys.forEach(key => {
        checksumString += encodeURIComponent(key) + '=' + encodeURIComponent(params[key]) + '&';
    });

    // Remove the last '&' character
    checksumString = checksumString.slice(0, -1);

    // Step 3: Append the secret key at the end
    checksumString += secretKey;

    // Log checksum string for debugging
    //console.log("Checksum String: ", checksumString);

    // Step 4: Generate checksum using HMAC with SHA-256
    const checksum = crypto.createHmac('sha256', secretKey)
                            .update(checksumString)
                            .digest('base64');  // Convert result to Base64

    return checksum;
};

module.exports = { generateChecksum };

