import cron from "node-cron";
import userModel from "../models/userModel.js";

// Every day at midnight
export const planCheckCronJob = () => {
  
  // cron.schedule("*/30 * * * * *", async () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 Running daily plan expiry check...");

    try {
      const now = new Date();

      // Sabhi users jinka plan endDate nikal gaya hai
      const expiredUsers = await userModel.find({
        "plan.endDate": { $lte: now },
      });

      for (const userModel of expiredUsers) {
        if (userModel.plan?.planId) {
          userModel.planHistory.push({
            planId: userModel.plan.planId,
            planType: userModel.plan.planType,
            startDate: userModel.plan.startDate,
            endDate: userModel.plan.endDate,
            status: "expired",
          });

          // Current plan ko null kar dena (ya hata dena)
          userModel.plan = null;

          await userModel.save();
          console.log(`✅ Plan expired for user ${userModel.name}`);
        }
      }
    } catch (err) {
      console.error("❌ Error in plan expiry cron job:", err);
    }
  });
};
