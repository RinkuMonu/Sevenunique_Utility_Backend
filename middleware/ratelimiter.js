const { RateLimiterRedis } = require("rate-limiter-flexible")
const redisClient = require("./redis");

const limiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: 100,
    duration: 60,
    blockDuration: 300
});


const redisRateLimit = async (req, res, next) => {
    try {
        // IP or user-based limit
        const key = req.user?._id || req.ip;

        await limiter.consume(key); // 1 point use karega
        next();
    } catch (err) {
        res.status(429).json({
            status: false,
            message: "Too many requests, please try again later.",
            retryAfter: Math.ceil(err.msBeforeNext / 1000) + " seconds",
        });
    }
};

module.exports = redisRateLimit;