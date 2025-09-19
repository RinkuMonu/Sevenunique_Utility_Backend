const jwt = require('jsonwebtoken');

function generatePaysprintJWT() {
    const timestamp = Math.floor(Date.now() / 1000);
    const requestId = `REQ_${Date.now()}_${Math.floor(Math.random() * 1000 + 1111)}`;

    // const jwtKey="UFMwMDE3OTIzYzdhYmFiZWU5OWJkMzAzNTEyNDQ0MmNmMGFiMWUyOA=="
    const jwtKey = "UFMwMDYyMjY0ZmJmYjIzYmNiMTliMDJjMmJjZWIxYjA5ZGUzNmJjYjE3NTEwMjI2Mzg="
    const payload = {
        timestamp: timestamp,
        // partnerId: 'PS0016226',
        partnerId: 'PS006226',
        reqid: requestId.toString()
    };
    const token = jwt.sign(payload, jwtKey, {
        algorithm: 'HS256',
        header: {
            typ: 'JWT',
            alg: 'HS256'
        }
    });

    return token;
}

module.exports = generatePaysprintJWT; 
