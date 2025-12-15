
exports.getISTDayRange = () => {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const now = new Date();

    // Convert current UTC time → IST
    const istNow = new Date(now.getTime() + IST_OFFSET);

    // IST start of day
    const startIST = new Date(istNow);
    startIST.setHours(0, 0, 0, 0);

    // IST end of day
    const endIST = new Date(istNow);
    endIST.setHours(23, 59, 59, 999);

    // Convert back to UTC for MongoDB
    return {
        startUTC: new Date(startIST.getTime() - IST_OFFSET),
        endUTC: new Date(endIST.getTime() - IST_OFFSET),
    };
};