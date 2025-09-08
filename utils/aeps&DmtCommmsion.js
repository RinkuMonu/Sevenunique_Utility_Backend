const UserMeta = require("../models/userMetaModel.js");

const getDmtOrAepsMeta = async (userId, service) => {
    if (!["DMT", "AEPS"].includes(service)) {
        throw new Error("Invalid service type. Must be 'DMT' or 'AEPS'.");
    }

    try {
        const userMeta = await UserMeta.findOne({ userId })
            .populate(service === "DMT" ? "dmtCommission" : "aepsCommission")
            .lean();

        if (!userMeta) return { enabled: false, message: "UserMeta not found" };

        const isEnabled = service === "DMT" ? userMeta.dmtEnabled : userMeta.aepsEnabled;
        if (!isEnabled) return { enabled: false, message: `${service} service not enabled` };

        const commissionPackage =
            service === "DMT" ? userMeta.dmtCommission : userMeta.aepsCommission;

        return {
            enabled: true,
            commissionPackage
        };

    } catch (error) {
        return { enabled: false, message: "Internal error", error: error.message };
    }
};

module.exports = getDmtOrAepsMeta;
