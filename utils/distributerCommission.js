// const userModel = require("../models/userModel");
// const PayInModel = require("../models/payInModel");
// const transactionModel = require("../models/transactionModel");

// async function distributeCommission({
//   user,
//   distributer,
//   service,
//   amount,
//   commission,
//   reference,
//   description = ""
// }) {
//   try {
//     // ✅ 1. Retailer Commission
//     const retailerUser = await userModel.findById(user);
//     if (retailerUser) {
//       let retailerAmount = 0;
//       if (commission.commissionMethod === "fixed") {
//         retailerAmount = Number(commission.retailer) || 0;
//       } else if (commission.commissionMethod === "percentage") {
//         retailerAmount = ((Number(commission.retailer) || 0) / 100) * Number(amount);
//       }

//       if (retailerAmount > 0) {
//         retailerUser.eWallet += retailerAmount;
//         await retailerUser.save();

//         await transactionModel.create({
//           user_id: retailerUser._id,
//           transaction_type: "credit",
//           amount: retailerAmount,
//           balance_after: retailerUser.eWallet,
//           payment_mode: "wallet",
//           transaction_reference_id: reference,
//           description: description || `Retailer commission for ${service}`,
//           status: "Success"
//         });

//         await PayInModel.create({
//           userId: retailerUser._id,
//           amount: retailerAmount,
//           reference: reference + "_RETAILER_COM",
//           name: retailerUser.name || "Retailer",
//           mobile: retailerUser.mobileNumber || 9999999999,
//           email: retailerUser.email || "na@example.com",
//           status: "Success",
//           charges: 0,
//           remark: `Commission credited for ${service}`
//         });
//       }
//     }

//     // ✅ 2. Distributor Commission
//     const distributorUser = await userModel.findById(distributer);
//     if (distributorUser) {
//       let distributorAmount = 0;
//       if (commission.commissionMethod === "fixed") {
//         distributorAmount = Number(commission.distributor) || 0;
//       } else if (commission.commissionMethod === "percentage") {
//         distributorAmount = ((Number(commission.distributor) || 0) / 100) * Number(amount);
//       }

//       if (distributorAmount > 0) {
//         distributorUser.eWallet += distributorAmount;
//         await distributorUser.save();

//         await transactionModel.create({
//           user_id: distributorUser._id,
//           transaction_type: "credit",
//           amount: distributorAmount,
//           balance_after: distributorUser.eWallet,
//           payment_mode: "wallet",
//           transaction_reference_id: reference,
//           description: description || `Distributor commission for ${service}`,
//           status: "Success"
//         });

//         await PayInModel.create({
//           userId: distributorUser._id,
//           amount: distributorAmount,
//           reference: reference + "_DIST_COM",
//           name: distributorUser.name || "Distributor",
//           mobile: distributorUser.mobileNumber || 9999999999,
//           email: distributorUser.email || "na@example.com",
//           status: "Success",
//           charges: 0,
//           remark: `Commission credited for ${service}`
//         });
//       }

//       // ✅ 3. Admin Commission (parent of distributor)
//       if (distributorUser.distributorId) {
//         const adminUser = await userModel.findById(distributorUser.distributorId);
//         if (adminUser) {
//           let adminAmount = 0;
//           if (commission.commissionMethod === "fixed") {
//             adminAmount = Number(commission.admin) || 0;
//           } else if (commission.commissionMethod === "percentage") {
//             adminAmount = ((Number(commission.admin) || 0) / 100) * Number(amount);
//           }

//           if (adminAmount > 0) {
//             adminUser.eWallet += adminAmount;
//             await adminUser.save();

//             await transactionModel.create({
//               user_id: adminUser._id,
//               transaction_type: "credit",
//               amount: adminAmount,
//               balance_after: adminUser.eWallet,
//               payment_mode: "wallet",
//               transaction_reference_id: reference,
//               description: description || `Admin commission for ${service}`,
//               status: "Success"
//             });

//             await PayInModel.create({
//               userId: adminUser._id,
//               amount: adminAmount,
//               reference: reference + "_ADMIN_COM",
//               name: adminUser.name || "Admin",
//               mobile: adminUser.mobileNumber || 9999999999,
//               email: adminUser.email || "na@example.com",
//               status: "Success",
//               charges: 0,
//               remark: `Commission credited for ${service}`
//             });
//           }
//         }
//       }
//     }

//   } catch (err) {
//     console.error("Error in distributeCommission:", err);
//   }
// }

// module.exports = {
//   distributeCommission
// };



const userModel = require("../models/userModel");
const PayInModel = require("../models/payInModel");
const transactionModel = require("../models/transactionModel");


async function distributeCommission({
  user,         
  distributer,  
  service,
  amount,
  commission,    
  reference,
  description = "",
  session = null, 
}) {

  const computeAmt = (raw) => {
    if (!raw && raw !== 0) return 0;
    if (typeof raw === "number") {
      if (commission && commission.commissionMethod === "percentage" && raw <= 100) {
        return (Number(raw) / 100) * Number(amount);
      }
      return Number(raw);
    }
    return 0;
  };

  try {
    // 1) Retailer
    if (user) {
      const retailerUser = await userModel.findById(user).session(session);
      if (retailerUser) {
        const retailerAmount = +computeAmt(commission.retailer || 0).toFixed(2);
        if (retailerAmount > 0) {
          retailerUser.eWallet = Number((retailerUser.eWallet || 0) + retailerAmount);
          await retailerUser.save({ session });

          await transactionModel.create([{
            user_id: retailerUser._id,
            transaction_type: "credit",
            amount: retailerAmount,
            balance_after: retailerUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: reference,
            description: description || `Retailer commission for ${service}`,
            status: "Success"
          }], { session });

          await PayInModel.create([{
            userId: retailerUser._id,
            amount: retailerAmount,
            reference: reference + "_RETAILER_COM",
            name: retailerUser.name || "Retailer",
            mobile: retailerUser.mobileNumber || 0,
            email: retailerUser.email || "na@example.com",
            status: "Success",
            charges: 0,
            remark: `Commission credited for ${service}`
          }], { session });
        }
      }
    }

    // 2) Distributor
    if (distributer) {
      const distributorUser = await userModel.findById(distributer).session(session);
      if (distributorUser) {
        const distributorAmount = +computeAmt(commission.distributor || 0).toFixed(2);
        if (distributorAmount > 0) {
          distributorUser.eWallet = Number((distributorUser.eWallet || 0) + distributorAmount);
          await distributorUser.save({ session });

          await transactionModel.create([{
            user_id: distributorUser._id,
            transaction_type: "credit",
            amount: distributorAmount,
            balance_after: distributorUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: reference,
            description: description || `Distributor commission for ${service}`,
            status: "Success"
          }], { session });

          await PayInModel.create([{
            userId: distributorUser._id,
            amount: distributorAmount,
            reference: reference + "_DIST_COM",
            name: distributorUser.name || "Distributor",
            mobile: distributorUser.mobileNumber || 0,
            email: distributorUser.email || "na@example.com",
            status: "Success",
            charges: 0,
            remark: `Commission credited for ${service}`
          }], { session });
        }

        // 3) Admin (upline of distributor)
        if (distributorUser.distributorId) {
          const adminUser = await userModel.findById(distributorUser.distributorId).session(session);
          if (adminUser) {
            const adminAmount = +computeAmt(commission.admin || 0).toFixed(2);
            if (adminAmount > 0) {
              adminUser.eWallet = Number((adminUser.eWallet || 0) + adminAmount);
              await adminUser.save({ session });

              await transactionModel.create([{
                user_id: adminUser._id,
                transaction_type: "credit",
                amount: adminAmount,
                balance_after: adminUser.eWallet,
                payment_mode: "wallet",
                transaction_reference_id: reference,
                description: description || `Admin commission for ${service}`,
                status: "Success"
              }], { session });

              await PayInModel.create([{
                userId: adminUser._id,
                amount: adminAmount,
                reference: reference + "_ADMIN_COM",
                name: adminUser.name || "Admin",
                mobile: adminUser.mobileNumber || 0,
                email: adminUser.email || "na@example.com",
                status: "Success",
                charges: 0,
                remark: `Commission credited for ${service}`
              }], { session });
            }
          }
        }
      }
    }

    return true;
  } catch (err) {
    throw err;
  }
}

module.exports = { distributeCommission };
