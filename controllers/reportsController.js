const BbpsHistory = require("../models/bbpsModel.js");
const DmtReport = require("../models/dmtTransactionModel.js");
const OnboardTransaction = require("../models/aepsModels/onboardingMerchants.js");
const { Parser } = require("json2csv");
const AEPSWithdrawal = require("../models/aepsModels/withdrawalEntry.js");
const { default: mongoose } = require("mongoose");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit"); // Make sure PDF is also imported
const userModel = require("../models/userModel.js");

exports.getBbpsReport = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      rechargeType,
      status,
      startDate,
      endDate,
      userId,
      search,
      operator,
      customerNumber,
      download,
    } = req.query;
    // Role-based matchStage
    const matchStage = {};
    
    if (rechargeType) matchStage.rechargeType = { $regex: rechargeType, $options: "i" };
    if (status) matchStage.status = status;
    console.log(matchStage);

    if (req.user.role === "Admin") {
      if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);
    } else if (req.user.role === "Distributor") {
      // Find all retailers under this distributor
      const users = await userModel
        .find({ distributorId: req.user.id })
        .select("_id");
      const userIds = users.map((u) => u._id);
      matchStage.userId = { $in: userIds };
    } else {
      // Retailer
      matchStage.userId = new mongoose.Types.ObjectId(req.user.id);
    }

    if (operator) matchStage.operator = new RegExp(operator, "i");
    if (customerNumber)
      matchStage.customerNumber = new RegExp(customerNumber, "i");
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const commonPipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      // Join with user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // Join with distributor
      {
        $lookup: {
          from: "users",
          localField: "user.distributorId",
          foreignField: "_id",
          as: "distributor",
        },
      },
      { $unwind: { path: "$distributor", preserveNullAndEmptyArrays: true } },

      // Search by user name
      ...(search
        ? [{ $match: { "user.name": { $regex: search, $options: "i" } } }]
        : []),

      {
        $project: {
          _id: 1,
          rechargeType: 1,
          operator: 1,
          customerNumber: 1,
          amount: 1,
          status: 1,
          charges: 1,
          gst: 1,
          tds: 1,
          totalCommission: 1,
          adminCommission: 1,
          distributorCommission: 1,
          retailerCommission: 1,
          transactionId: 1,
          extraDetails: 1,
          "user.name": 1,
          "user.email": 1,
          "distributor._id": 1,
          "distributor.name": 1,
          "distributor.email": 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    // CSV Download
    if (download === "csv") {
      const data = await BbpsHistory.aggregate(commonPipeline);

      const formattedData = data.map((item) => ({
        Name: item.user?.name || "",
        Email: item.user?.email || "",
        Distributor: item.distributor?.name || "",
        Operator: item.operator,
        CustomerNumber: item.customerNumber,
        Amount: item.amount,
        Charges: item.charges,
        Status: item.status,
        RechargeType: item.rechargeType,
        TransactionId: item.transactionId,
        CreatedAt: item.createdAt,
      }));

      const csv = new Parser().parse(formattedData);
      res.header("Content-Type", "text/csv");
      res.attachment("bbps-report.csv");
      return res.send(csv);
    }

    // Pagination
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    const paginatedPipeline = [
      ...commonPipeline,
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
    ];

    const results = await BbpsHistory.aggregate(paginatedPipeline);

    const countPipeline = [{ $match: matchStage }, { $count: "total" }];
    const countResult = await BbpsHistory.aggregate(countPipeline);
    const total = countResult.length ? countResult[0].total : 0;

    res.json({
      success: true,
      data: results,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        totalResults: total,
      },
    });
  } catch (err) {
    console.error("🔥 Error fetching BBPS report:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllDmtReports = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      referenceid,
      remitter,
      startDate,
      endDate,
      export: exportType,
      user_id,
    } = req.query;
    const filter = {};
    if (req.user.role === "Admin") {
      if (user_id) filter.user_id = new mongoose.Types.ObjectId(user_id);
    } else if (req.user.role === "Distributor") {
      // Find all retailers under this distributor
      const users = await userModel
        .find({ distributorId: req.user.id })
        .select("_id");
      const userIds = users.map((u) => u._id);
      filter.user_id = { $in: userIds };
    } else {
      // Retailer
      filter.user_id = new mongoose.Types.ObjectId(req.user.id);
    }
    if (typeof status !== "undefined" && status !== "") {
      if (status === "1" || status === 1 || status === true) {
        filter.status = true;
      } else if (status === "0" || status === 0 || status === false) {
        filter.status = false;
      }
    }

    if (referenceid) filter.referenceid = referenceid;
    if (remitter) {
      filter.$or = [
        { remitter: { $regex: remitter, $options: "i" } },
        { benename: { $regex: remitter, $options: "i" } },
        { referenceid: { $regex: remitter, $options: "i" } },
      ];
    }

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }
    console.log(filter);

    const reportsQuery = DmtReport.find(filter)
      .populate("user_id", "name")
      .sort({ createdAt: -1 });
    console.log(reportsQuery);

    // Handle export functionality
    if (exportType) {
      const allReports = await reportsQuery.exec();

      const formattedReports = allReports.map((r) => {
        const obj = r.toObject();
        obj.user_name = r.user_id?.name || "";
        delete obj.user_id;
        return obj;
      });

      switch (exportType) {
        case "csv":
          const csvData = formattedReports.map((r) => ({
            user_name: r.user_name,
            referenceid: r.referenceid,
            ackno: r.ackno,
            utr: r.utr,
            txn_status: r.txn_status,
            benename: r.benename,
            remitter: r.remitter,
            account_number: r.account_number,
            status: r.status,
            message: r.message,
            txn_amount: r.gatewayCharges?.txn_amount || 0,
            customercharge: r.gatewayCharges?.customercharge || 0,
            netcommission: r.gatewayCharges?.netcommission || 0,
            gst: r.gatewayCharges?.gst || 0,
            tds: r.gatewayCharges?.tds || 0,
            distributor: r.charges?.distributor || 0,
            admin: r.charges?.admin || 0,
            createdAt: r.createdAt,
          }));

          const fields = [
            "user_name",
            "referenceid",
            "ackno",
            "utr",
            "txn_status",
            "benename",
            "remitter",
            "account_number",
            "status",
            "message",
            "txn_amount",
            "customercharge",
            "netcommission",
            "gst",
            "tds",
            "distributor",
            "admin",
            "createdAt",
          ];

          const parser = new Parser({ fields });
          const csv = parser.parse(csvData);

          res.header("Content-Type", "text/csv");
          res.attachment(`dmt-report-${Date.now()}.csv`);
          return res.send(csv);

        case "excel":
          // For Excel export, we'll use the same data structure as CSV
          const excelData = formattedReports.map((r) => ({
            user_name: r.user_name,
            referenceid: r.referenceid,
            ackno: r.ackno,
            utr: r.utr,
            txn_status: r.txn_status,
            benename: r.benename,
            remitter: r.remitter,
            account_number: r.account_number,
            status: r.status,
            message: r.message,
            txn_amount: r.gatewayCharges?.txn_amount || 0,
            customercharge: r.gatewayCharges?.customercharge || 0,
            netcommission: r.gatewayCharges?.netcommission || 0,
            gst: r.gatewayCharges?.gst || 0,
            tds: r.gatewayCharges?.tds || 0,
            distributor: r.charges?.distributor || 0,
            admin: r.charges?.admin || 0,
            createdAt: r.createdAt,
          }));

          // Convert to Excel using exceljs
          const ExcelJS = require("exceljs");
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet("DMT Report");

          // Add headers
          worksheet.columns = [
            { header: "User Name", key: "user_name", width: 20 },
            { header: "Reference ID", key: "referenceid", width: 20 },
            { header: "Ack No", key: "ackno", width: 20 },
            { header: "UTR", key: "utr", width: 20 },
            { header: "Transaction Status", key: "txn_status", width: 15 },
            { header: "Beneficiary Name", key: "benename", width: 20 },
            { header: "Remitter", key: "remitter", width: 20 },
            { header: "Account Number", key: "account_number", width: 20 },
            { header: "Status", key: "status", width: 10 },
            { header: "Message", key: "message", width: 30 },
            { header: "Transaction Amount", key: "txn_amount", width: 15 },
            { header: "Customer Charge", key: "customercharge", width: 15 },
            { header: "Net Commission", key: "netcommission", width: 15 },
            { header: "GST", key: "gst", width: 10 },
            { header: "TDS", key: "tds", width: 10 },
            { header: "Distributor", key: "distributor", width: 15 },
            { header: "Admin", key: "admin", width: 15 },
            { header: "Created At", key: "createdAt", width: 20 },
          ];

          // Add data
          worksheet.addRows(excelData);

          // Set response headers
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=dmt-report-${Date.now()}.xlsx`
          );

          // Write to response
          await workbook.xlsx.write(res);
          return res.end();

        case "pdf":
          // For PDF export, we'll use pdfkit
          const PDFDocument = require("pdfkit");
          const doc = new PDFDocument();

          // Set response headers
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=dmt-report-${Date.now()}.pdf`
          );

          // Pipe PDF to response
          doc.pipe(res);

          // Add content
          doc.fontSize(20).text("DMT Report", { align: "center" });
          doc.moveDown();

          // Add table data
          let yPosition = 100;
          formattedReports.forEach((report, index) => {
            if (index > 0 && index % 25 === 0) {
              doc.addPage();
              yPosition = 50;
            }

            doc
              .fontSize(10)
              .text(
                `${index + 1}. ${report.referenceid} - ${report.remitter} → ${
                  report.benename
                } (${report.account_number}) - ₹${
                  report.gatewayCharges?.txn_amount || 0
                } - ${report.status ? "Success" : "Failed"}`,
                50,
                yPosition
              );

            yPosition += 20;
          });

          // Finalize PDF
          doc.end();
          return;

        case "json":
          // For JSON export, simply send the JSON data
          res.setHeader("Content-Type", "application/json");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=dmt-report-${Date.now()}.json`
          );
          return res.send(JSON.stringify(formattedReports, null, 2));

        default:
          return res.status(400).json({
            success: false,
            message: "Invalid export format",
          });
      }
    }

    // Regular paginated response (non-export)
    const reports = await reportsQuery
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const formattedReports = reports.map((r) => {
      const obj = r.toObject();
      obj.user_name = r.user_id?.name || "";
      delete obj.user_id;
      return obj;
    });

    const count = await DmtReport.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: formattedReports,
      pagination: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getAllOnboardTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      merchantcode,
      mobile,
      status,
      startDate,
      endDate,
      user_id: queryUserId,
    } = req.query;

    const role = req.user.role;
    const userId = req.user.id;

    const filter = {};
    if (merchantcode) {
      filter.merchantcode = { $regex: merchantcode, $options: "i" };
    }
    if (mobile) filter.mobile = mobile;
    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }
    const transactions = await OnboardTransaction.find(filter)
      .populate("user_id", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const count = await OnboardTransaction.countDocuments(filter);

    const formatted = transactions.map((r) => {
      const obj = r.toObject();
      obj.user_name = r.user_id?.name || "";
      delete obj.user_id;
      return obj;
    });

    res.status(200).json({
      success: true,
      data: formatted,
      pagination: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getMerchantByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const merchantData = await OnboardTransaction.findOne({
      merchantcode: 101,
    });

    if (!merchantData || merchantData.length === 0) {
      return res
        .status(404)
        .json({ message: "No merchant records found for this user." });
    }
    return res.status(200).json(merchantData);
  } catch (error) {
    console.error("Error fetching merchant details:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.aepsTransactions = async (req, res, next) => {
  try {
    const {
      userId,
      status,
      startDate,
      endDate,
      keyword,
      page = 1,
      limit = 10,
      export: exportType,
    } = req.query;
    console.log(status);
    const matchStage = {};

    if (req?.user?.role === "Admin") {
      if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);
    } else {
      matchStage.userId = new mongoose.Types.ObjectId(req.user.id);
    }

    if (status !== undefined) {
      const parsedStatus =
        status === "true" || status === true
          ? true
          : status === "false" || status === false
          ? false
          : undefined;

      if (parsedStatus !== undefined) {
        matchStage.status = parsedStatus;
      }
    }

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const keywordFilters = [];
    if (keyword) {
      const regex = { $regex: keyword, $options: "i" };
      keywordFilters.push(
        { mobilenumber: regex },
        { adhaarnumber: regex },
        { clientrefno: regex },
        { bankrrn: regex },
        { submerchantid: regex },
        { bankiin: regex }
      );

      if (!isNaN(keyword)) {
        keywordFilters.push({ ackno: Number(keyword) });
      }
    }

    const pipeline = [{ $match: matchStage }];

    if (keywordFilters.length > 0) {
      pipeline.push({ $match: { $or: keywordFilters } });
    }

    pipeline.push({ $sort: { createdAt: -1 } });

    const downloadPipeline = [...pipeline];

    // ===== EXPORT HANDLER =====
    if (exportType) {
      let exportData = await AEPSWithdrawal.aggregate(downloadPipeline);

      exportData = exportData.map((item) => ({
        mobilenumber: item.mobilenumber,
        adhaarnumber: `'${item.adhaarnumber?.toString()}'`,
        amount: item.amount,
        balanceamount: item.balanceamount,
        clientrefno: item.clientrefno,
        ackno: item.ackno,
        bankiin: item.bankiin,
        submerchantid: item.submerchantid,
        bankrrn: item.bankrrn,
        status: item.status ? "Success" : "Failed",
        createdAt: item.createdAt,
      }));

      // ---- CSV ----
      if (exportType === "csv") {
        const fields = Object.keys(exportData[0] || {});
        const parser = new Parser({ fields });
        const csv = parser.parse(exportData);

        res.header("Content-Type", "text/csv");
        res.attachment(`aeps-transactions-${Date.now()}.csv`);
        return res.send(csv);
      }

      // ---- EXCEL ----
      if (exportType === "excel") {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("AEPS Transactions");
        worksheet.columns = Object.keys(exportData[0] || {}).map((key) => ({
          header: key,
          key,
          width: 20,
        }));
        worksheet.addRows(exportData);

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=aeps-transactions-${Date.now()}.xlsx`
        );

        await workbook.xlsx.write(res);
        return res.end();
      }

      // ---- PDF ----
      if (exportType === "pdf") {
        const doc = new PDFDocument({ margin: 30, size: "A4" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=aeps-transactions-${Date.now()}.pdf`
        );
        doc.pipe(res);

        doc
          .fontSize(18)
          .text("AEPS Transactions", { align: "center" })
          .moveDown();

        const tableHeaders = Object.keys(exportData[0] || {});
        doc.fontSize(10);

        exportData.forEach((row, i) => {
          if (i === 0) {
            tableHeaders.forEach((h) =>
              doc.text(h, { continued: true, width: 90 })
            );
            doc.moveDown();
          }
          tableHeaders.forEach((h) =>
            doc.text(String(row[h] || ""), { continued: true, width: 90 })
          );
          doc.moveDown();
        });

        doc.end();
        return;
      }

      // ---- JSON ----
      if (exportType === "json") {
        res.setHeader("Content-Type", "application/json");
        return res.json(exportData);
      }
    }

    // ===== PAGINATION =====
    const transactions = await AEPSWithdrawal.aggregate([
      ...pipeline,
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    ]);

    const count = await AEPSWithdrawal.countDocuments(matchStage);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: { total: count, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const transaction = await AEPSWithdrawal.findById(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    return next(error);
  }
};
