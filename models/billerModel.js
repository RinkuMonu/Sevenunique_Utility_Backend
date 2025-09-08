const mongoose = require("mongoose");

const billerSchema = new mongoose.Schema(
  {
    billerId: { type: String, required: true, unique: true },
    billerAliasName: String,
    billerName: String,
    billerCategory: String,
    billerCoverage: String,
    billerFetchRequiremet: String,
    billerPaymentExactness: String,
    billerSupportBillValidation: String,
    billerInputParams: Array,
    billerAmountOptions: String,
    billerPaymentModes: String,
    rechargeAmountInValidationRequest: String,
    billerDescription: String,
    supportPendingStatus: String,
    supportDeemed: String,
    billerTimeout: String,
    billerPaymentChannels: Array,
    billerAdditionalInfo: Array,
    planAdditionalInfo: Array,
    planMdmRequirement: String,
    billerResponseType: String,
    billerPlanResponseParams: Array,
    interchangeFeeCCF1: Object,
    billerStatus: String,
  },
  {
    timestamps: true,
  }
);

const Biller = mongoose.model("Biller", billerSchema);
module.exports = Biller;
