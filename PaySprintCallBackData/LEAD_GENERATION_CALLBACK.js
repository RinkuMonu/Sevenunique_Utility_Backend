const mongoose = require("mongoose");
const LoanLeadModal = require("../models/LoanLead.modal");

exports.LEAD_GENERATION_CALLBACK = async (data, user) => {

    const param = data.param;
    const session = await mongoose.startSession();
    try {
        if (!param || !param.refid) {
            throw new Error("Invalid callback payload");
        }
        session.startTransaction();

        await LoanLeadModal.findOneAndUpdate(
            { refId: param.refid },
            {
                retailerId: user._id,
                merchantcode: param.merchantcode,
                name: param.name,
                mobile: param.mobile_no,
                email: param.email,
                product: param.product,
                pincode: param.pincode,
                state: param.state,
                executive_status: param.executive_status,
                executive_updated_date: param.executive_updated_date,
                executive_remarks: param.executive_remarks,
                extraData: param,
                provider: "paySprint"
            },
            {
                upsert: true,
                new: true,
                session
            }
        );

        await session.commitTransaction();

        return {
            status: 200,
            message: "Lead callback processed successfully",
        };
    } catch (error) {
        console.log("📌 Loan Lead Callback error", error);
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        return {
            status: 400,
            message: error.message || "Lead callback processed error",
        };

    } finally {
        session?.endSession();
    }


};