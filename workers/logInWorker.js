const { Worker } = require("bullmq");
const redis = require("../middleware/redis");

if (redis) {
  const worker = new Worker(
    "logInQueue",
    async (job) => {

      const { userId, time } = job.data;

      console.log("Login job processing:", userId);

      // example task
      // save login history
      // send email
      // analytics

    },
    {
       connection: redis }
  );
  worker.on("completed", job => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.log(`Job failed`, err);
  });
}
