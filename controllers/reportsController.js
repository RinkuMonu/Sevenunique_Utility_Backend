const BbpsHistory = require('../models/bbpsModel.js');
const DmtReport = require('../models/dmtTransactionModel.js');
const OnboardTransaction = require('../models/aepsModels/onboardingMerchants.js');
const { Parser } = require('json2csv');
const AEPSWithdrawal = require('../models/aepsModels/withdrawalEntry.js');
const { default: mongoose } = require('mongoose');


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
      operator,
      customerNumber,
      download // flag: download=csv
    } = req.query;

    const matchStage = {};

    if (rechargeType) matchStage.rechargeType = rechargeType;
    if (status) matchStage.status = status;
    if (req.user.role === 'Admin') {
      if (userId) matchStage.userId = mongoose.Types.ObjectId(userId);
    } else if (req.user.role === 'Distributor') {
      matchStage.distributorId = req.user.id;
    } else {
      matchStage.userId = req.user.id;
    }

    if (operator) matchStage.operator = new RegExp(operator, 'i');
    if (customerNumber) matchStage.customerNumber = new RegExp(customerNumber, 'i');
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const commonPipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          rechargeType: 1,
          operator: 1,
          customerNumber: 1,
          amount: 1,
          status: 1,
          charges: 1,
          transactionId: 1,
          extraDetails: 1,
          'user.name': 1,
          'user.email': 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    ];

    // 📥 CSV Download Mode
    if (download === 'csv') {
      const data = await BbpsHistory.aggregate(commonPipeline);

      const formattedData = data.map(item => ({
        Name: item.user?.name || '',
        Email: item.user?.email || '',
        Operator: item.operator,
        CustomerNumber: item.customerNumber,
        Amount: item.amount,
        Charges: item.charges,
        Status: item.status,
        RechargeType: item.rechargeType,
        TransactionId: item.transactionId,
        CreatedAt: item.createdAt
      }));

      const csv = new Parser().parse(formattedData);

      res.header("Content-Type", "text/csv");
      res.attachment("bbps-report.csv");
      return res.send(csv);
    }

    // 📤 Normal Paginated Response
    const paginatedPipeline = [
      ...commonPipeline,
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];

    const results = await BbpsHistory.aggregate(paginatedPipeline);

    const countPipeline = [
      { $match: matchStage },
      { $count: 'total' }
    ];
    const countResult = await BbpsHistory.aggregate(countPipeline);
    const total = countResult.length ? countResult[0].total : 0;

    res.json({
      success: true,
      data: results,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalResults: total,
      }
    });

  } catch (err) {
    console.error('🔥 Error fetching BBPS report:', err);
    res.status(500).json({ success: false, message: 'Server error' });
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
      export_csv,
      user_id: queryUserId
    } = req.query;

    const role = req.user.role;
    const userId = req.user.id;
    const filter = {};
    if (role === 'Admin') {
      if (queryUserId) filter.user_id = queryUserId;
    } else {
      filter.user_id = userId;
    }
    if (typeof status != "undefined") filter.status = status == 1 ? true : false;
    if (referenceid) filter.referenceid = referenceid;
    if (remitter) filter.remitter = remitter;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }
    const reportsQuery = DmtReport.find(filter)
      .populate('user_id', 'name')
      .sort({ createdAt: -1 });

    if (export_csv === 'true') {
      const allReports = await reportsQuery.exec();

      const csvData = allReports.map((r) => ({
        user_name: r.user_id?.name || '',
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
        'user_name', 'referenceid', 'ackno', 'utr', 'txn_status', 'benename',
        'remitter', 'account_number', 'status', 'message',
        'txn_amount', 'customercharge', 'netcommission', 'gst',
        'tds', 'distributor', 'admin', 'createdAt'
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment(`dmt-report-${Date.now()}.csv`);
      return res.send(csv);
    }

    const reports = await reportsQuery
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const formattedReports = reports.map(r => {
      const obj = r.toObject();
      obj.user_name = r.user_id?.name || '';
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
      filter.merchantcode = { $regex: merchantcode, $options: 'i' };
    }
    if (mobile) filter.mobile = mobile;
    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }
    const transactions = await OnboardTransaction.find(filter)
      .populate('user_id', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const count = await OnboardTransaction.countDocuments(filter);

    const formatted = transactions.map((r) => {
      const obj = r.toObject();
      obj.user_name = r.user_id?.name || '';
      delete obj.user_id;
      return obj;
    });

    res.status(200).json({
      success: true,
      data: formatted,
      pagination: { total: count, page: Number(page), limit: Number(limit) }
    });
  } catch (err) {
    return next(err);
  }
};

exports.getMerchantByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const merchantData = await OnboardTransaction.findOne({ merchantcode: 101 });

    if (!merchantData || merchantData.length === 0) {
      return res.status(404).json({ message: 'No merchant records found for this user.' });
    }
    return res.status(200).json(merchantData);
  } catch (error) {
    console.error('Error fetching merchant details:', error);
    return res.status(500).json({ message: 'Internal server error' });
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
      download
    } = req.query;

    const matchStage = {};

    if (req?.user?.role === "Admin") {
      if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);
    } else {
      matchStage.userId = new mongoose.Types.ObjectId(req.user.id);
    }

    if (status !== undefined) {
      if (typeof status == 'boolean') {
        matchStage.status = status;
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const [transactions, total] = await Promise.all([
      AEPSWithdrawal.aggregate(pipeline),
      AEPSWithdrawal.aggregate([...downloadPipeline, { $count: "total" }])
    ]);

    const totalRecords = total[0]?.total || 0;

    if (download === "csv") {
      let csvData = await AEPSWithdrawal.aggregate(downloadPipeline);

      // Format aadhaarnumber to preserve formatting (string), or mask it
      csvData = csvData.map(item => ({
        ...item,
        adhaarnumber: `'${item.adhaarnumber?.toString()}'`
      }));

      const fields = [
        "mobilenumber",
        "adhaarnumber",
        "amount",
        "balanceamount",
        "clientrefno",
        "ackno",
        "bankiin",
        "submerchantid",
        "status",
        "createdAt"
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(csvData);

      res.header("Content-Type", "text/csv");
      res.attachment("aeps-transactions.csv");
      return res.send(csv);
    }


    res.status(200).json({
      success: true,
      count: transactions.length,
      total: totalRecords,
      page: parseInt(page),
      limit: parseInt(limit),
      data: transactions,
    });
  } catch (error) {
    return next(error);
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
