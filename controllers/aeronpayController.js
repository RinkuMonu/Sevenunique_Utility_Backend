const { default: axios } = require("axios");
const mongoose = require("mongoose");

const aeronpayHeader = {
    "client-id": process.env.Client_ID,
    "client-secret": process.env.Client_Secret,
    "Content-Type": "application/json"
}


exports.bankFetch = async (req, res) => {
    try {
        const aeronpayRes = await axios.post("https://api.aeronpay.in/api/serviceapi-prod/api/payout/bankid_list", {
            "category": "bankids"
        }, { headers: aeronpayHeader })
        console.log(aeronpayRes);
        res.send({
            status: true,
            msg: "Bank list",
            data: aeronpayRes.data
        })

    } catch (error) {
        res.send({
            status: false,
            massage: error
        })
    }

}
exports.transfer = async (req, res) => {
    try {
        const payload = {
            amount,
            client_referenceId,
            transferMode: "imps"
        }
        const aeronpayRes = await axios.post("https://api.aeronpay.in/api/serviceapi-prod/api/payout/imps",
            payload, { headers: aeronpayHeader })
        console.log(aeronpayRes);
        res.send({
            status: true,
            msg: "Transfer successful",
            data: aeronpayRes.data
        })

    } catch (error) {
        res.send({
            status: false,
            massage: error
        })
    }

}
exports.callBack = async (req, res) => {
    try {
        console.log("aeronPay callBack body data", req.body);
        console.log("aeronPay callBack query data", req.query);
        const data = req.body

        res.send({
            status: true,
            data
        })

    } catch (error) {
        console.log("aeronpay.callBack error", error);

        res.send({
            status: false,
            massage: error
        })
    }

}