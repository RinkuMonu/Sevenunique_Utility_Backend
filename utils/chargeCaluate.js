const User = require("../models/userModel");
const UserMeta = require("../models/userMetaModel");
const Service = require("../models/servicesModal");
const mongoose = require('mongoose');
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


function calculateCommissionFromSlabs(amount, packageData, operatorName) {
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
    if (operatorName) {
      matchedSlab = packageData.slabs.find(s => s.operator == operatorName.toLowerCase());
      if (amount <= 0) {
        throw new Error(`Please enter a vaild amount.`);
      }
    } else {
      matchedSlab = packageData.slabs[0]
      if (amount <= 0) {
        throw new Error(`Please enter a vaild amount.`);
      }
    }
  }
  console.log("matchedSlab---", matchedSlab);

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

  chargeAmount = calc(matchedSlab.chargeAmount) || 0;


  retailerAmt = calc(matchedSlab.retailer) || 0;
  distributorAmt = calc(matchedSlab.distributor);
  adminAmt = calc(matchedSlab.admin);


  // GST & TDS package level
  const gst = (chargeAmount * (packageData.gst || 0)) / 100;
  const tds = (chargeAmount * (packageData.tds || 0)) / 100;


  return {
    amount,
    slabRange:
      matchedSlab.commissionMethod === 'slab' ? `[${matchedSlab.minAmount} - ${matchedSlab.maxAmount}]` : '',
    // type: matchedSlab.type, // charges / commission
    commissionMethod: matchedSlab.commissionMethod,
    commissionType: matchedSlab.commissionType,

    retailer: retailerAmt.toFixed(2),
    distributor: distributorAmt.toFixed(2),
    admin: adminAmt.toFixed(2),
    gst: gst.toFixed(2),
    tds: tds.toFixed(2),
    charge: +chargeAmount.toFixed(2),
    totalCommission: (retailerAmt + distributorAmt + adminAmt).toFixed(2),
  };
}


const getApplicableServiceCharge = async (userId, serviceName, operatorName) => {
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
      const commissions = await commissionModel.findById(matchedService.packageId)
      if (!commissions) {
        throw new Error("Package not found");
      }
      return {
        commissions, service
        // source: "UserMeta",
        // chargeType: matchedService.chargeType,
        // serviceCharges: matchedService.serviceCharges,
        // gst: commission.gst,
        // tds: commission.tds,
        // distributorCommission: matchedService.distributorCommission,
        // adminCommission: matchedService.adminCommission,
      };
    }
  }

  // Fallback to default provider from Service
  const matchedProvider = service.providers.find(
    (p) => p.name === service.defaultSwitch
  );

  if (!matchedProvider) {
    throw new Error("No matching default provider found in Service");
  }

  let commissions;


  if (!operatorName) {
    commissions = await commissionModel.findOne({
      service: service._id,
      isDefault: true,
      isActive: true,
    });
  } else {

    commissions = await commissionModel.findOne({
      service: service._id,
      isDefault: true,
      isActive: true,
      "slabs.operator": operatorName.toLowerCase(),
    });
  }



  if (!commissions) {
    throw new Error("commission not found.");

  }

  return {
    commissions, service
    // source: `${commission.packageName}`,
    // chargeType: matchedProvider.chargeType || "fixed",
    // serviceCharges: matchedProvider.serviceCharges || 0,
    // gst: commission.gst || 0,
    // tds: commission.tds || 0,
    // distributorCommission: matchedProvider.distributorCommission || 0,
    // adminCommission: matchedProvider.adminCommission || 0,
  };
};

function applyServiceCharges(amount, packageData, operatorName = null) {
  if (!packageData) throw new Error("Package data is required");

  // 1️⃣ Pick the right slab
  let matchedSlab;

  // If operatorName is provided, try to match operator slab
  if (operatorName && packageData.slabs?.length) {
    matchedSlab = packageData.slabs.find(
      (s) =>
        s.operator?.toLowerCase() === operatorName.toLowerCase() &&
        amount >= s.minAmount &&
        amount <= s.maxAmount
    );
    if (!matchedSlab) throw new Error("No matching slab for this operator and amount");
  } else {
    // Fallback: pick first slab or default
    matchedSlab = packageData.slabs?.[0];
    if (!matchedSlab) throw new Error("No slab found in the package");
  }

  // 2️⃣ Helper calculation based on method/type
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

  // 3️⃣ Compute commissions / charges
  let baseCharge = 0,
    retailer = 0,
    distributor = 0,
    admin = 0;

  if (matchedSlab.type === "charges") {
    baseCharge = matchedSlab.chargeAmount || 0;
    retailer = -calc(baseCharge);
    distributor = calc(matchedSlab.distributor);
    admin = calc(matchedSlab.admin);
  } else if (matchedSlab.type === "commission") {
    baseCharge = 0;
    retailer = calc(matchedSlab.retailer);
    distributor = calc(matchedSlab.distributor);
    admin = calc(matchedSlab.admin);
  }

  // 4️⃣ GST & TDS
  const gstAmount = (amount * (packageData.gst || 0)) / 100;
  const tdsAmount = (amount * (packageData.tds || 0)) / 100;

  // 5️⃣ Total deductions & net amount
  const totalDeducted = baseCharge + gstAmount + tdsAmount;
  const netAmount = amount - totalDeducted;

  return {
    amount,
    slabRange: `[${matchedSlab.minAmount} - ${matchedSlab.maxAmount}]`,
    type: matchedSlab.type,
    commissionMethod: matchedSlab.commissionMethod,
    commissionType: matchedSlab.commissionType,

    baseCharge: +baseCharge.toFixed(2),
    gstAmount: +gstAmount.toFixed(2),
    tdsAmount: +tdsAmount.toFixed(2),
    totalDeducted: +totalDeducted.toFixed(2),

    retailer: +retailer.toFixed(2),
    distributor: +distributor.toFixed(2),
    admin: +admin.toFixed(2),
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

