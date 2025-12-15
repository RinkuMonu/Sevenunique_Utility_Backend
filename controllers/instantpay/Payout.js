const { default: axios } = require("axios");

const getHeaders = () => {

    return {
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Client-Id": process.env.INSTANTPAY_CLIENT_ID,
        "X-Ipay-Client-Secret": process.env.INSTANTPAY_CLIENT_SECRET,
        "X-Ipay-Endpoint-Ip": "223.226.127.0",
        "Content-Type": "application/json",
    };
};

class InstantPay_payout {

    async bankList(req, res) {
        try {

            const bankList = await axios.get("https://api.instantpay.in/payments/payout/banks", {
                headers: getHeaders()
            });
            console.log(bankList)
            return res.status(200).json({
                data: bankList.data,
                success: true,
                message: "Bank list"
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }

    async transfer(req, res) {
        try {

            const reponse = await axios.get("https://api.instantpay.in/payments/payout", {
                headers: getHeaders()
            });
            console.log(reponse)
            return res.status(200).json({
                success: true,
                data: reponse.data,
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }

}

module.exports = InstantPay_payout;
