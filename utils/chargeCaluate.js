const User = require("../models/userModel");
const UserMeta = require("../models/userMetaModel");
const Service = require("../models/servicesModal");
const mongoose = require("mongoose");
const logger= require("./logger");


function calculateCommissionFromSlabs(amount, slabs, gstRate = 18, tdsRate = 5) {
  const matchedSlab = slabs.find(slab => amount >= slab.minAmount && amount <= slab.maxAmount);

  if (!matchedSlab) {
    throw new Error(`No matching commission slab found for amount ₹${amount}`);
  }

  const calc = (val) =>
    matchedSlab.commissionType === 'percentage' ? (val * amount) / 100 : val;

  const retailer = calc(matchedSlab.retailer);
  const distributor = calc(matchedSlab.distributor);
  const admin = calc(matchedSlab.admin);

  const gst = (retailer * gstRate) / 100;
  const tds = (retailer * tdsRate) / 100;

  return {
    amount,
    slabRange: `[${matchedSlab.minAmount} - ${matchedSlab.maxAmount}]`,
    commissionType: matchedSlab.commissionType,
    retailer: +retailer.toFixed(2),
    distributor: +distributor.toFixed(2),
    admin: +admin.toFixed(2),
    gst: +gst.toFixed(3),
    tds: +tds.toFixed(3),
    totalCommission: +(retailer + distributor + admin + gst + tds).toFixed(2)
  };
}


const getApplicableServiceCharge = async (userId, serviceName) => {
  if (!mongoose.Types.ObjectId.isValid(userId) || !serviceName) {
    throw new Error("Invalid userId or serviceId");
  }

  const [user, service] = await Promise.all([
    User.findById(userId),
    Service.findOne({ name: serviceName })
  ]);

  if (!user || !user.status) {
    throw new Error("User not found or inactive");
  }
  if (!user || !user.isKycVerified) {
    throw new Error("User Kyc not verified");
  }

  if (!service || !service.isActive) {
    throw new Error("Service not found or inactive");
  }

  if (user.isSpecial) {
    const userMeta = await UserMeta.findOne({ userId });

    if (!userMeta) {
      throw new Error("UserMeta not found");
    }

    const matchedService = userMeta.services.find(
      (s) => s.serviceId.toString() === service?._id.toString() && s.status === "active"
    );

    if (matchedService) {
      return {
        source: "UserMeta",
        chargeType: matchedService.chargeType,
        serviceCharges: matchedService.serviceCharges,
        gst: matchedService.gst,
        tds: matchedService.tds,
        distributorCommission: matchedService.distributorCommission,
        adminCommission: matchedService.adminCommission,
      };
    }
  }

  // Fallback to default provider from Service
  const matchedProvider = service.providers.find(
    (p) => p.providerName === service.defaultSwitch
  );

  if (!matchedProvider) {
    throw new Error("No matching default provider found in Service");
  }

  return {
    source: "Service",
    chargeType: matchedProvider.chargeType || "fixed",
    serviceCharges: matchedProvider.serviceCharges || 0,
    gst: matchedProvider.gst || 0,
    tds: matchedProvider.tds || 0,
    distributorCommission: matchedProvider.distributorCommission || 0,
    adminCommission: matchedProvider.adminCommission || 0,
  };
};

function applyServiceCharges(amount, commissions) {
  const {
    chargeType,
    serviceCharges,
    gst = 0,
    tds = 0,
    distributorCommission = 0,
    adminCommission = 0
  } = commissions;

  let baseCharge = 0;

  if (chargeType === "fixed") {
    baseCharge = serviceCharges;
  } else if (chargeType === "percentage") {
    baseCharge = (amount * serviceCharges) / 100;
  }

  const gstAmount = (baseCharge * gst) / 100;
  const tdsAmount = (baseCharge * tds) / 100;

  const totalDeducted = baseCharge + gstAmount + tdsAmount;
  const netAmount = amount - totalDeducted;

  return {
    baseCharge: +baseCharge.toFixed(2),
    gstAmount: +gstAmount.toFixed(2),
    tdsAmount: +tdsAmount.toFixed(2),
    totalDeducted: +totalDeducted.toFixed(2),
    distributorCommission: +distributorCommission.toFixed(2),
    adminCommission: +adminCommission.toFixed(2),
    netAmount: +netAmount.toFixed(2),
  };
}

function logApiCall({ url, requestData, responseData = null, error = null }) {
  if (responseData) {
    logger.info(`baseurl ${url} Request :`, requestData);
    logger.info(`baseurl ${url} Response:`, responseData);
  }
}

module.exports = {
  getApplicableServiceCharge, calculateCommissionFromSlabs, applyServiceCharges, logApiCall
};

