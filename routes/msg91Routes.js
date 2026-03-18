const { whatsappMsg } = require("../controllers/mas91Controller");

const msg91Router = require("express").Router();

msg91Router.post("/whatsapp/msg", whatsappMsg)


module.exports = msg91Router;