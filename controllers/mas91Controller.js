const { default: axios } = require("axios");

exports.whatsappMsg = async (req, res) => {
    try {
        console.log("running Controller...........");
        const { numbers } = req.body;
        const payload = {
            "integrated_number": "919251582692",
            "content_type": "template",
            "payload": {
                "messaging_product": "whatsapp",
                "type": "template",
                "template": {
                    "name": "testing",
                    "language": {
                        "code": "en",
                        "policy": "deterministic"
                    },
                    "namespace": "c401ecad_b94f_4692_819e_b63cdb42aba9",
                    "to_and_components": [
                        {
                            "to": [
                                `${numbers}`
                            ],
                            "components": {}
                        }
                    ]
                }
            }
        }

        const result = await axios.post(
            "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    authkey: process.env.MSG91_AUTH_KEY,
                },
            }
        );
        return res.send({
            status: true,
            data: result.data
        })

    } catch (error) {
        console.log("Whatsapp msg error", error.response.data);
        return res.send({
            status: false,
            data: error.response.data
        })
    }

}