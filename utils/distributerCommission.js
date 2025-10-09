const userModel = require("../models/userModel");
const PayInModel = require("../models/payInModel");
const transactionModel = require("../models/transactionModel");
const servicesModal = require("../models/servicesModal");

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

  const computeGross = (raw) => {

    if (raw === undefined || raw === null) return 0;
    const rawNum = Number(raw) || 0;
    if (commission && commission.commissionMethod === "percentage") {

      return (rawNum / 100) * Number(amount);
    }

    return rawNum;
  };

  const computeDeductions = (gross) => {
    const gstPercent = Number(commission?.gst || 0);
    const tdsPercent = Number(commission?.tds || 0);
    const gstAmt = gstPercent > 0 ? (gross * gstPercent) / 100 : 0;
    const tdsAmt = tdsPercent > 0 ? (gross * tdsPercent) / 100 : 0;
    const net = Number((gross - gstAmt - tdsAmt).toFixed(2));
    return {
      gst: Number(gstAmt.toFixed(2)),
      tds: Number(tdsAmt.toFixed(2)),
      net
    };
  };

  try {
    // 1) Retailer
    if (user) {
      const retailerUser = await userModel.findById(user).session(session);
      if (retailerUser) {
        const grossRetailer = +computeGross(commission.retailer || 0).toFixed(2);
        if (grossRetailer > 0) {
          const { gst, tds, net } = computeDeductions(grossRetailer);

          retailerUser.eWallet = Number((retailerUser.eWallet || 0) + net);
          await retailerUser.save({ session });

          // Transaction: record net amount + GST/TDS details + totals
          await transactionModel.create([{
            user_id: retailerUser._id,
            transaction_type: "credit",
            amount: commission.retailer,
            type: service._id,
            gst,
            tds,
            charge: 0,
            totalDebit: Number((gst + tds).toFixed(2)),
            totalCredit: net,
            // netAmount: net,
            balance_after: retailerUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: reference,
            description: description || `Retailer commission for ${service.name} (gross ₹${grossRetailer})`,
            status: "Success",
            meta: { grossCommission: String(grossRetailer) }
          }], { session });

          await PayInModel.create([{
            userId: retailerUser._id,
            type: service._id,
            amount: net,
            reference: reference + "_RETAILER_COM",
            name: retailerUser.name || "Retailer",
            mobile: retailerUser.mobileNumber || 0,
            email: retailerUser.email || "na@example.com",
            source: "Commission",
            fromUser: retailerUser._id,
            service: service._id,
            status: "Success",
            charges: Number((gst + tds).toFixed(2)),
            remark: `Commission credited for ${service.name} (gross ₹${grossRetailer}, gst ₹${gst}, tds ₹${tds})`
          }], { session });
        }
      }
    }

    // 2) Distributor
    if (distributer) {
      const distributorUser = await userModel.findById(distributer).session(session);
      if (distributorUser) {
        const grossDistributor = +computeGross(commission.distributor || 0).toFixed(2);
        if (grossDistributor > 0) {
          const { gst, tds, net } = computeDeductions(grossDistributor);

          distributorUser.eWallet = Number((distributorUser.eWallet || 0) + net);
          await distributorUser.save({ session });

          await transactionModel.create([{
            user_id: distributorUser._id,
           type: service._id,
            transaction_type: "credit",
            amount: commission.distributor,
            gst,
            tds,
            charge: 0,
            totalDebit: Number((gst + tds).toFixed(2)),
            totalCredit: net,
            // netAmount: net,
            balance_after: distributorUser.eWallet,
            payment_mode: "wallet",
            transaction_reference_id: reference,
            description: description || `Distributor commission for ${service.name} (gross ₹${grossDistributor})`,
            status: "Success",
            meta: { grossCommission: String(grossDistributor) }
          }], { session });

          await PayInModel.create([{
            userId: distributorUser._id,
           type: service._id,
            amount: net,
            reference: reference + "_DIST_COM",
            name: distributorUser.name || "Distributor",
            mobile: distributorUser.mobileNumber || 0,
            email: distributorUser.email || "na@example.com",
            status: "Success",
            source: "Commission",
            fromUser: user,
            service: service._id,
            charges: Number((gst + tds).toFixed(2)),
            remark: `Commission credited for ${service.name} (gross ₹${grossDistributor}, gst ₹${gst}, tds ₹${tds})`
          }], { session });

        }

        // 3) Admin (upline of distributor)
        if (distributorUser.distributorId) {
          const adminUser = await userModel.findById(distributorUser.distributorId).session(session);
          if (adminUser) {
            const grossAdmin = +computeGross(commission.admin || 0).toFixed(2);
            if (grossAdmin > 0) {
              const { gst, tds, net } = computeDeductions(grossAdmin);

              adminUser.eWallet = Number((adminUser.eWallet || 0) + net);
              await adminUser.save({ session });

              await transactionModel.create([{
                user_id: adminUser._id,
                transaction_type: "credit",
                 type: service._id,
                amount: commission.admin,
                gst,
                tds,
                charge: 0,
                totalDebit: Number((gst + tds).toFixed(2)),
                totalCredit: net,
                // netAmount: net,
                balance_after: adminUser.eWallet,
                payment_mode: "wallet",
                transaction_reference_id: reference,
                description: description || `Admin commission for ${service.name} (gross ₹${grossAdmin})`,
                status: "Success",
                meta: { grossCommission: String(grossAdmin) }
              }], { session });

              await PayInModel.create([{
                userId: adminUser._id,
                amount: net,
                 type: service._id,
                reference: reference + "_ADMIN_COM",
                name: adminUser.name || "Admin",
                mobile: adminUser.mobileNumber || 0,
                email: adminUser.email || "na@example.com",
                status: "Success",
                source: "Commission",
                fromUser: user,
                service: service._id,
                charges: Number((gst + tds).toFixed(2)),
                remark: `Commission credited for ${service.name} (gross ₹${grossAdmin}, gst ₹${gst}, tds ₹${tds})`
              }], { session });
            }
          }
        }
      }
    }

    return true;
  } catch (err) {
    // bubble up error to caller so transaction/session rollback can happen where used
    throw err;
  }
}

module.exports = { distributeCommission };
