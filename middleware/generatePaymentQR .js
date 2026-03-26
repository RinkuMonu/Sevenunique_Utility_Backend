const QRCode = require("qrcode");

exports.generatePaymentQR = async (userMobile) => {
    const qrImage = await QRCode.toDataURL(userMobile);
    return qrImage;
};
