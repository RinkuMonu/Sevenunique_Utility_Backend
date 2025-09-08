const cron = require("node-cron");
const User = require("../models/userModel");

// ✅ Run cron job every day at midnight (12:00 AM)
cron.schedule("0 0 * * *", async () => {
  console.log("⏳ [CRON] Running daily expired plan check...");

  const now = new Date();
  console.log(`🕒 [INFO] Current Time: ${now.toISOString()}`);

  try {
    // ✅ Find all users whose plans have expired
    const expiredUsers = await User.find({
      "plan.endDate": { $lte: now },
      "plan.planId": { $ne: null },
    });

    console.log(`🔍 [INFO] Expired Users Found: ${expiredUsers.length}`);

    if (expiredUsers.length === 0) {
      console.log("✅ [CRON] No expired plans found.");
      return;
    }

    // ✅ Remove plans from expired users
    for (const user of expiredUsers) {
      console.log(`⚠️ [ACTION] Removing plan for user: ${user.name} (${user._id})`);

      user.plan = {
        planId: null,
        planType: null,
        startDate: null,
        endDate: null,
      };
      user.status = "Pending";

      // ✅ Save updated user status
      await user.save();
      console.log(`✅ [SUCCESS] Plan removed for user: ${user.name}`);
    }

    console.log("🎉 [CRON] Daily plan expiration check completed successfully!");
  } catch (error) {
    console.error("❌ [ERROR] CRON Job Failed:", error);
  }
});

module.exports = cron;
