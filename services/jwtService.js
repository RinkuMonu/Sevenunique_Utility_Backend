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
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8');
  const ivBuf = Buffer.isBuffer(iv) ? iv : Buffer.from(iv, 'utf8');

  const cipher = crypto.createCipheriv('aes-128-cbc', keyBuf, ivBuf);
  const raw = Buffer.concat([
    cipher.update(piddata, 'utf8'),
    cipher.final()
  ]);

  return raw.toString('base64');
}


module.exports = { generateJwtToken, encryptPidData };
