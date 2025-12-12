const redis = require("ioredis");

const redisClient = new redis({
    host: "127.0.0.1",
    port: "6379"
});

redisClient.on("connect", () => console.log("Redis Connected"))
redisClient.on("error", (error) => console.log("Redis error", error))