exports.getISTDayRange = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);
    console.log(start, end)
    return {
        startUTC: start,
        endUTC: end,
    };
};