import cron from "node-cron";
import userModel from "../models/userModel.js";
import payInModel from "../models/payInModel.js";
import Transaction from "../models/transactionModel.js";
import { sendBatchOnboardingMail } from "../controllers/Iserveu.js";
import scratchCouponModel from "../models/scratchCoupon.model.js";

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

  cron.schedule("* * * * *", async () => {
    console.log("⏱️ [CRON] Checking for expired pending wallets...");

    try {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      const expired = await payInModel.find({
        status: "Pending",
        createdAt: { $lte: cutoff },
        pgTransId: { $exists: false },
      });

      if (expired.length === 0) return;

      for (const p of expired) {
        p.status = "Failed";
        p.remark = "User left payment page without completing transaction";
        await p.save();

        await Transaction.findOneAndUpdate(
          { transaction_reference_id: p.reference },
          {
            $set: {
              status: "Failed",
              description:
                "User left payment page without completing transaction",
            },
          }
        );

        console.log(
          `❌ [AUTO-FAIL] PayIn ${p.reference} marked as FAILED (timeout)`
        );
      }
    } catch (err) {
      console.error("❌ [ERROR] Auto-fail PayIn CRON:", err.message);
    }
  });


  cron.schedule("0 1 * * *", async () => {
    console.log("🎟️ Running scratch coupon expiry cron...");
    try {
      const result = await scratchCouponModel.updateMany(
        {
          status: "UNSCRATCHED",
          expiresAt: { $lte: new Date() },
        },
        {
          $set: { status: "EXPIRED" },
        }
      );

      console.log(
        `✅ Coupon Expiry Done | Expired Coupons: ${result.modifiedCount}`
      );
    } catch (err) {
      console.error("❌ Coupon expiry cron error:", err);
    }
  }, { timezone: "Asia/Kolkata" });


  // cron.schedule("*/15 * * * * *", async () => {
  //   // cron.schedule("*/2 * * * *", async () => {
  //   console.log("⏱ Cron Running — Checking onboarding queue...");
  //   await sendBatchOnboardingMail(false);
  // });
};
