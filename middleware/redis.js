const Redis = require("ioredis");

let redis = null
if (process.env.REDIS_ENABLED == "true") {
    redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === "true" ? {} : undefined,
        // host: "127.0.0.1",
        // port: 6379,
        enableOfflineQueue: false, //(no api carsh... safe mode)
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
            if (times > 5) {
                console.error("❌ Redis retry limit reached, stopping retries", times);
                return null;
            }
            return times * 400; // 500ms, 1s, 1.5s...
        }
    });
    redis.on("connect", () => {
        console.log("Redis connected successfully");
        console.log("Redis connected successfully");
    });

    redis.on("error", (err) => {
        console.error("Redis connection error:", err.message);
    });
} else {
    console.log("⚠️ Redis disabled by env");
    console.log("⚠️ Redis disabled by env");
}

module.exports = redis;
