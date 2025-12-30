const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');


const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access token missing or malformed' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("decoded", decoded)
    const user = await userModel.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_INVALID",
        message: "User not found",
      });
    }
    if (user.forceLogout) {
      return res.status(401).json({
        success: false,
        code: "FORCE_LOGOUT",
        message: "Role updated. Please login again.",
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authenticateToken;
