const { Worker } = require("bullmq");
const redis = require("../middleware/redis");

if(redis){
  const worker = new Worker(
    "logoutQueue",
    async (job) => {
  
      const { userId, time } = job.data;
  
      console.log("Logout job processing:", userId);
  
      // example task
      // save logout history
      // send email
      // analytics
  
    },
    { connection: redis }
  );
}
