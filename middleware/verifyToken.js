const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const redis = require('./redis');


const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access token missing or malformed' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("decoded", decoded)
    let user = await userModel.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "FORCE_LOGOUT",
        message: "User not found",
      });
    }
    let redisToken = null
    if (redis) {
      redisToken = await redis.get(`USER_SESSION:${user._id || user.id}`);
      if (!redisToken || redisToken !== token) {
        return res.status(401).json({
          success: false,
          code: "FORCE_LOGOUT",
          message: "Session expried. Please login again.",
        });
      }
    }
    if (user.forceLogout) {
      return res.status(401).json({
        success: false,
        code: "FORCE_LOGOUT",
        message: "Session expried. Please login again.",
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      code: "FORCE_LOGOUT",
      message: 'Invalid & Expired Token Login Again.',
    });
  }
};

module.exports = authenticateToken;
