import { Queue } from "bullmq";
const redis = require("../middleware/redis.js");

const logInQueue = new Queue("loginQueue", {
  connection: redis
});

module.export = logInQueue;