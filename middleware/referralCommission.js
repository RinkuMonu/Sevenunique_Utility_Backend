const Transaction = require("../models/transactionModel");
const userModel = require("../models/userModel");


const processReferralCommission = async (buyer, transactionRef, planId, session) => {
    let currentUser = buyer;
    let level = 1;

    while (currentUser.referredBy) {
        const referrer = await userModel
            .findById(currentUser.referredBy)
            .session(session);

        if (!referrer) break;

        let commission = 0;

        if (referrer.role === "Distributor") {
            if (level === 1) commission = 299;
            else if (level === 2) commission = 50;
            else commission = 25;
        } else {
            if (level === 1) commission = 100;
            else if (level === 2) commission = 50;
            else commission = 25;
        }

        const updateReferrer = await userModel
            .findByIdAndUpdate(referrer._id,
                { $inc: { eWallet: commission } },
                { new: true, session }
            )

        await Transaction.create(
            [
                {
                    user_id: referrer._id,
                    sender_Id: buyer._id,
                    type: planId,
                    type2: "Referral Commission",
                    transaction_type: "credit",
                    amount: commission,
                    totalCredit: commission,
                    balance_after: updateReferrer.eWallet,
                    status: "Success",
                    payment_mode: "system",
                    transaction_reference_id: `R&E_${transactionRef}`,
                    description: `Referral commission level ${level}`,
                    meta: {
                        source: "PlanPurchase commission",
                    },
                },
            ],
            { session }
        );

        currentUser = referrer;
        level++;
    }
};

module.exports = { processReferralCommission };
