const UserMeta = require("../models/userMetaModel.js");

function serviceChargeMiddleware(serviceNameFromRoute) {
  return async function (req, res, next) {
    try {
      const userId = req.user.id;

      if (!serviceNameFromRoute) {
        return res.status(400).json({ message: "Service name is required in middleware" });
      }

      const userMeta = await UserMeta.findOne({ userId }).populate("services.serviceId");

      if (!userMeta) {
        return res.status(404).json({ message: "UserMeta not found" });
      }

      const userService = userMeta.services.find(
        s =>s.serviceId.name.toLowerCase() === serviceNameFromRoute.toLowerCase()
      );

      if (!userService) {
        return res.status(403).json({ message: `Service '${serviceNameFromRoute}' not assigned to user` });
      }

      const serviceDoc = userService.serviceId;

      req.serviceChargeMeta = {
        switch: userService.switch || serviceDoc.defaultSwitch,
        serviceId: serviceDoc._id,
        serviceName: serviceDoc.name,
        chargeType: userService.chargeType,
        serviceCharges: userService.serviceCharges,
        gst: userService.gst,
        distributorCommission: userService.distributorCommission,
      };

      next();
    } catch (err) {
      console.error("Error in serviceChargeMiddleware:", err);
      res.status(500).json({ message: "Internal server error in service middleware" });
    }
  };
}

module.exports = serviceChargeMiddleware;
