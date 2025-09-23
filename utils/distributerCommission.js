const userModel = require("../models/userModel");
const PayInModel = require("../models/payInModel");
const transactionModel = require("../models/transactionModel");

async function distributeCommission({
  distributer,
  service,
  amount,
  commission,
  reference,
  description = ""
}) {
  try {
    const distributorUser = await userModel.findById(distributer);
    if (!distributorUser) {
      return null
    }

    let distributorAmount = 0;
    if (commission.commissionMethod === "fixed") {
      distributorAmount = Number(commission.distributor) || 0;
    } else if (commission.commissionMethod === "percentage") {
      distributorAmount = ((Number(commission.distributor) || 0) / 100) * Number(amount);
    }

    if (distributorAmount > 0) {
      distributorUser.eWallet += distributorAmount;
      await distributorUser.save();

      await transactionModel.create({
        user_id: distributer,
        transaction_type: "credit",
        amount: distributorAmount,
        balance_after: distributorUser.eWallet,
        payment_mode: "wallet",
        transaction_reference_id: reference,
        description: description || `Commission for ${service}`,
        status: "Success"
      });

      await PayInModel.create({
        userId: distributer,
        amount: distributorAmount,
        reference: reference + "_COM", // Ensure uniqueness
        name: distributorUser.name || "Distributor",
        mobile: distributorUser.mobileNumber || 9999999999,
        email: distributorUser.email || "na@example.com",
        status: "Success",
        charges: 0,
        remark: `Commission credited for ${service}`
      });
    }

  } catch (err) {
    console.error("Error in distributeCommission:", err);
  }
}

module.exports = {
  distributeCommission
};
