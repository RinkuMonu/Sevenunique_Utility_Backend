const User = require("../models/userModel");
const UserMeta = require("../models/userMetaModel");
const Service = require("../models/servicesModal");
const mongoose = require("mongoose");
const logger = require("./logger");
const commissionModel = require("../models/commissionModel");


// function calculateCommissionFromSlabs(amount, slabs) {
//   if (!slabs || !slabs.slabs?.length) {
//     throw new Error("No slabs found in the package");
//   }

//   if (slabs[0].minAmount > amount) {
//     throw new Error(`Minium Amount required ₹${slabs[0].minAmount}`);
//   }
//   if (slabs[slabs.length - 1].maxAmount < amount) {
//     throw new Error(`Max Amount required ₹${slabs[slabs.length - 1].maxAmount}`);
//   }
//   const matchedSlab = slabs.find(slab => amount >= slab.minAmount && amount <= slab.maxAmount);

//   if (!matchedSlab) {
//     throw new Error(`No matching commission slab found for amount ₹${amount}`);
//   }

//   const calc = (val) =>
//     matchedSlab.commissionType === 'percentage' ? (val * amount) / 100 : val;

//   const retailer = calc(matchedSlab.retailer);
//   const distributor = calc(matchedSlab.distributor);
//   const admin = calc(matchedSlab.admin);

//   const gst = (amount * slabs.gst) / 100;
//   const tds = (amount * slabs.tds) / 100;

//   return {
//     amount,
//     slabRange: `[${matchedSlab.minAmount} - ${matchedSlab.maxAmount}]`,
//     commissionType: matchedSlab.commissionType,
//     retailer: +retailer.toFixed(2),
//     distributor: +distributor.toFixed(2),
//     admin: +admin.toFixed(2),
//     gst: +gst.toFixed(3),
//     tds: +tds.toFixed(3),
//     totalCommission: +(retailer + distributor + admin + gst + tds).toFixed(2)
//   };
// }


function calculateCommissionFromSlabs(amount, packageData) {
  if (!packageData || !packageData.slabs?.length) {
    throw new Error("No slabs found in the package");
  }

  let matchedSlab;

  // Slab handling only if commissionType = slab
  if (packageData.slabs[0].commissionMethod === "slab") {
    const firstSlab = packageData.slabs[0];
    const lastSlab = packageData.slabs[packageData.slabs.length - 1];

    if (amount < firstSlab.minAmount) {
      throw new Error(`Minimum amount allowed is ₹${firstSlab.minAmount}`);
    }
    if (amount > lastSlab.maxAmount) {
      throw new Error(`Maximum amount allowed is ₹${lastSlab.maxAmount}`);
    }

    matchedSlab = packageData.slabs?.find(
      (slab) => amount >= slab.minAmount && amount <= slab.maxAmount
    );
    if (!matchedSlab) {
      throw new Error(`Amount ₹${amount} not in any slab range`);
    }
  } else {
    matchedSlab = packageData.slabs[0];
  }

  // 🟢 Calculation helper
  const calc = (val) => {
    if (!val) return 0;

    if (matchedSlab.commissionMethod === "fixed") return val;
    if (matchedSlab.commissionMethod === "percentage") return (val * amount) / 100;

    if (matchedSlab.commissionMethod === "slab") {
      if (matchedSlab.commissionType === "flat") return val;
      if (matchedSlab.commissionType === "percentage") return (val * amount) / 100;
    }

    return 0;
  };

  // 🟢 Commission / Charge calculation
  let retailerAmt = 0,
    distributorAmt = 0,
    adminAmt = 0,
    chargeAmount = 0;

  if (matchedSlab.type === "charges") {

    chargeAmount = matchedSlab.chargeAmount || 0;


    retailerAmt = -calc(chargeAmount);
    distributorAmt = calc(matchedSlab.distributor);
    adminAmt = calc(matchedSlab.admin);
  } else if (matchedSlab.type === "commission") {

    retailerAmt = calc(matchedSlab.retailer);
    distributorAmt = calc(matchedSlab.distributor);
    adminAmt = calc(matchedSlab.admin);
  }

  // GST & TDS package level
  const gst = (amount * (packageData.gst || 0)) / 100;
  const tds = (amount * (packageData.tds || 0)) / 100;

  return {
    amount,
    slabRange:
      matchedSlab.commissionMethod === `[${matchedSlab.minAmount} - ${matchedSlab.maxAmount}]`,
    type: matchedSlab.type, // charges / commission
    commissionMethod: matchedSlab.commissionMethod,
    commissionType: matchedSlab.commissionType,

    retailer: +(chargeAmount ? -chargeAmount : retailerAmt).toFixed(2),
    distributor: +distributorAmt.toFixed(2),
    admin: +adminAmt.toFixed(2),
    gst: +gst.toFixed(2),
    tds: +tds.toFixed(2),

    totalCommission: +(
      retailerAmt + distributorAmt + adminAmt + gst + tds
    ).toFixed(2),
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

  if (!user) {
    throw new Error("User not found.");
  }
  if (!user.status) {
    throw new Error("User inactive");
  }
  if (!user.isKycVerified) {
    throw new Error("User Kyc not verified");
  }

  if (!service) {
    throw new Error("Service not found.");
  }
  if (!service.isActive) {
    throw new Error("Service inactive");
  }

  if (user.isSpecial) {
    const userMeta = await UserMeta.findOne({ userId });

    if (!userMeta) {
      throw new Error("UserMeta not found");
    }

    const matchedService = userMeta.services.find(
      (s) => s.serviceId.toString() === service?._id.toString());

    if (matchedService) {
      const commission = await commissionModel.findById(matchedService.packageId)
      if (!commission) {
        throw new Error("Package not found");
      }
      return {
        source: "UserMeta",
        // chargeType: matchedService.chargeType,
        // serviceCharges: matchedService.serviceCharges,
        gst: commission.gst,
        tds: commission.tds,
        // distributorCommission: matchedService.distributorCommission,
        // adminCommission: matchedService.adminCommission,
      };
    }
  }

  // Fallback to default provider from Service
  const matchedProvider = service.providers.find(
    (p) => p === service.defaultSwitch
  );

  if (!matchedProvider) {
    throw new Error("No matching default provider found in Service");
  }

  const commission = await commissionModel.findOne({
    service: service._id,
    isDefault: true,
    isActive: true
  });

  if (!commission) {
    throw new Error("commission not found.");

  }

  return {
    source: `${commission.packageName}`,
    // chargeType: matchedProvider.chargeType || "fixed",
    // serviceCharges: matchedProvider.serviceCharges || 0,
    gst: commission.gst || 0,
    tds: commission.tds || 0,
    // distributorCommission: matchedProvider.distributorCommission || 0,
    // adminCommission: matchedProvider.adminCommission || 0,
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

