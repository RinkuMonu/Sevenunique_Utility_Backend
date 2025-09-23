const commissionModel = require("../models/commissionModel.js");
const servicesModal = require("../models/servicesModal.js");
const UserMeta = require("../models/userMetaModel.js");
const userModel = require("../models/userModel.js");

const getCommissionPackage = async (userId, serviceName) => {
    // ✅ User check
    const user = await userModel.findById(userId).lean();
    if (!user) throw new Error("User not found");

    // ✅ Service check
    const service = await servicesModal.findOne({ name: serviceName }).lean();
    if (!service) throw new Error(`${serviceName} service not found`);

    // ✅ If user isSpecial
    if (user.isSpecial) {
        const userMeta = await UserMeta.findOne({ userId }).lean();
        if (!userMeta) throw new Error("UserMeta not found");

        const matchedService = userMeta.services?.find(
            (s) => s.serviceId.toString() === service._id.toString()
        );

        if (matchedService) {

            const commissionPackage = await commissionModel.findById(matchedService.packageId).lean();
            if (!commissionPackage) throw new Error("Commission package not found for special user");
            return commissionPackage;
        }
    }

    //  Else default package
    const commissionPackage = await commissionModel.findOne({
        service: service._id,
        isDefault: true,
        isActive: true
    }).lean();

    if (!commissionPackage) throw new Error("Default commission package not found");

    return commissionPackage;
};

module.exports = getCommissionPackage;
