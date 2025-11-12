const cron = require("node-cron");
const User = require("../models/userModel");
const payInModel = require("../models/payInModel");
const Transaction = require("../models/transactionModel");

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

cron.schedule("* * * * *", async () => {
  console.log("⏱️ [CRON] Checking for expired pending wallets...");

  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); 
    const expired = await payInModel.find({
      status: "Pending",
      createdAt: { $lte: cutoff }
    });

    if (expired.length === 0) return;

    for (const p of expired) {
      p.status = "FAILED";
      p.remark = "User left payment page without completing transaction";
      await p.save();

      await Transaction.findOneAndUpdate(
        { transaction_reference_id: p.reference },
        {
          $set: {
            status: "FAILED",
            description: "User left payment page without completing transaction",
          },
        }
      );

      console.log(`❌ [AUTO-FAIL] PayIn ${p.reference} marked as FAILED (timeout)`);
    }
  } catch (err) {
    console.error("❌ [ERROR] Auto-fail PayIn CRON:", err.message);
  }
});


module.exports = cron;
