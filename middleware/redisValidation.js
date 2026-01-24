const redis = require("./redis");
const { default: mongoose } = require("mongoose");

exports.acquireLock = async (key, value, ttl) => {
    if (!redis) return true; // proceed without lock

    const result = await redis.set(key, value, "NX", "EX", ttl);
    return result === "OK";
};

exports.releaseLock = async (key, value) => {
    if (!redis) return;

    const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `;
    await redis.eval(luaScript, 1, key, value);
};

exports.invalidateUsersCache = async () => {
    if (!redis) return;
    let cursor = "0";// no user all user cache user only first after then next
    try {
        do {
            const [nextCursor, keys] = await redis.scan(// scan one by one "user" cache
                cursor,// where should to start
                "MATCH",// use only who key that match to user cache key
                "users:*",// only user cache 
                "COUNT",// Ek baar me max 100 keys do
                100
            );

            cursor = nextCursor;

            if (keys.length) {
                await redis.del(keys);
            }
        } while (cursor !== "0");
    } catch (error) {
        console.log("Redis invalidate users cache error", error)
    }
};

exports.invalidateUserProfileCacheByService = async (serviceId) => {
    if (!redis) return;

    try {
        const User = require("../models/userModel");
        const ServicePlan = require("../models/servicePlanmodel");
        const plans = await ServicePlan.find(
            { services: new mongoose.Types.ObjectId(serviceId) },
            "_id"
        )

        if (!plans.length) {
            console.log("❌ No plans found for service:", serviceId);
            return;
        }

        const planIds = plans.map(p => p._id);
        console.log(planIds)

        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            console.log("❌ Invalid serviceId");
            return;
        }

        const users = await User.find({
            "plan.planId": { $in: planIds },
        });

        if (!users.length) {
            console.log("ℹ️ No users found for affected plans");
            return;
        }

        const multi = redis.multi();
        users.forEach(u => {
            multi.del(`profile:user:${u._id}`);
        });

        await multi.exec();
        console.log(
            `🧹 Cleared profile cache for ${users.length} users (service ${serviceId})`
        );
    } catch (err) {
        console.error("Service cache invalidation failed:", err.message);
    }
};

exports.invalidateProfileCache = async (userId) => {
    if (!redis) return;

    try {
        await redis.del(
            `profile:self:${userId}`,   // user apni profile
            `profile:user:${userId}`    // admin / distributor view
        );
        console.log("🧹 Profile cache cleared for user:", userId);
    } catch (e) {
        console.log("❌ Profile cache invalidate failed", e.message);
    }
};

exports.invalidateAllDashboardCache = async () => {
    if (!redis) return;

    let cursor = "0";
    try {
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                "MATCH",
                "dashboard:*",
                "COUNT",
                100
            );
            cursor = nextCursor;

            if (keys.length) {
                await redis.del(keys);
            }
        } while (cursor !== "0");
        console.log("All dashboard cache cleared");
    } catch (error) {
        console.log(error.message || "dashboard api invalidation function")
    }
};

exports.invalidatePermissionsCache = async () => {
    if (!redis) return;

    try {
        await redis.del("getAllPermission:");
        console.log("🧹Getall Permissions cache cleared");
    } catch (e) {
        console.log("❌ Permissions cache invalidate failed", e.message);
    }
};

exports.invalidateUserPermissionsCache = async (userId) => {
    if (!redis) return;
    try {
        await redis.del(`permissions:user:${userId}`);
        console.log("🧹 User permissions cache cleared:", userId);
    } catch (e) {
        console.log("Permission cache invalidate failed");
    }
};


exports.invalidateNEWSCache = async () => {
    if (!redis) return;
    try {
        await redis.del(
            "news:all",
            "news:header",
            "news:notification"
        );
        console.log("🧹 News cache cleared");
    } catch (e) {
        console.log("❌ News cache invalidate failed", e.message);
    }
};

exports.invalidateBannerCache = async () => {
    if (!redis) return;
    try {
        await redis.del(
            "getAllBanner"
        );
        console.log("🧹 getAllBanner cache cleared");
    } catch (e) {
        console.log("❌ getAllBanner cache invalidate failed", e.message);
    }
};

exports.invalidateLoginHistoryCache = async (userId) => {
    if (!redis) return;

    try {
        let cursor = "0";

        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                "MATCH",
                userId
                    ? `loginHistory:user:${userId}:*`
                    : "loginHistory:admin:*",
                "COUNT",
                100
            );

            cursor = nextCursor;

            if (keys.length) {
                await redis.del(keys);
            }
        } while (cursor !== "0");

        // 🔥 Admin cache bhi clear (jab koi bhi login kare)
        if (userId) {
            let adminCursor = "0";
            do {
                const [next, adminKeys] = await redis.scan(
                    adminCursor,
                    "MATCH",
                    "loginHistory:admin:*",
                    "COUNT",
                    100
                );
                adminCursor = next;

                if (adminKeys.length) {
                    await redis.del(adminKeys);
                }
            } while (adminCursor !== "0");
        }

        console.log("🧹 Login history cache cleared correctly");
        if (userId) {
            console.log("🧹 Login history cache cleared correctly", userId);
        }
    } catch (e) {
        console.log("Login history cache clear failed", e.message);
    }

};


const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 10 * 60;

exports.checkLoginAttempts = async (key) => {
    if (!redis) return;
    try {
        const attempts = await redis.get(key);
        if (attempts && Number(attempts) >= MAX_ATTEMPTS) {
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error checking login attempts:", error);
        return true;
    }
};

exports.incrementLoginAttempts = async (key) => {
    if (!redis) return;
    try {
        const attempts = await redis.incr(key);
        if (attempts === 1) {
            await redis.expire(key, BLOCK_TIME); //ttl set only first time
        }
    } catch (error) {
        console.error("Error incrementing login attempts:", error);
    }
};

exports.resetLoginAttempts = async (key) => {
    if (!redis) return;
    try {
        await redis.del(key);
    } catch (error) {
        console.error("Error resetting login attempts:", error);
    }
};

const OTP_MAX_ATTEMPTS = 3;
const OTP_BLOCK_TIME = 10 * 60;

exports.checkOtpLimit = async (key) => {
    if (!redis) return;
    try {
        const count = await redis.get(key);
        if (count && Number(count) >= OTP_MAX_ATTEMPTS) {
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error checking OTP limit:", error);
        return true;
    }
};

exports.incrementOtpCount = async (key) => {
    if (!redis) return;
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, OTP_BLOCK_TIME);// ttl set only first time
        }
    } catch (error) {
        console.error("Error incrementing OTP count:", error);
    }
};
