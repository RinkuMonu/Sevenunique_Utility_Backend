const redis = require("./redis");

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
