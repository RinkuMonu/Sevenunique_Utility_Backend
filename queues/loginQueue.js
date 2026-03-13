import { Queue } from "bullmq";
const redis = require("../middleware/redis.js");

const logoutQueue = new Queue("logoutQueue", {
  connection: redis
});

module.export = logoutQueue;