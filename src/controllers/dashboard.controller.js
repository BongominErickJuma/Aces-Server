/**
 * Dashboard Controller
 * Handles dashboard statistics and reporting endpoints
 */

const User = require('../models/User.model');
const Quotation = require('../models/Quotation.model');
const Receipt = require('../models/Receipt.model');
const Notification = require('../models/Notification.model');
const AuditLog = require('../models/AuditLog.model');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler.middleware');

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const now = new Date();
  const periodDays = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365
  };

  const days = periodDays[period] || 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousPeriodStart = new Date(
    startDate.getTime() - days * 24 * 60 * 60 * 1000
  );

  // Parallel queries for better performance
  const [
    // User statistics
    totalUsers,
    activeUsers,
    newUsersThisPeriod,
    newUsersPreviousPeriod,

    // Document statistics
    totalQuotations,
    totalReceipts,
    quotationsThisPeriod,
    quotationsPreviousPeriod,
    receiptsThisPeriod,
    receiptsPreviousPeriod,

    // Move type counts
    internationalOrders,
    officeMoves,
    residentialMoves,

    // Financial statistics
    totalRevenue,
    revenueThisPeriod,
    revenuePreviousPeriod,

    // Status breakdowns
    quotationsByStatus,
    receiptsByStatus,
    receiptsByPaymentStatus,

    // Recent activity
    recentQuotations,
    recentReceipts,
    unreadNotificationsCount
  ] = await Promise.all([
    // Users
    User.countDocuments({ status: 'active' }),
    User.countDocuments({
      status: 'active',
      lastLogin: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
    }),
    User.countDocuments({
      createdAt: { $gte: startDate },
      status: 'active'
    }),
    User.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate },
      status: 'active'
    }),

    // Documents
    Quotation.countDocuments(),
    Receipt.countDocuments(),
    Quotation.countDocuments({ createdAt: { $gte: startDate } }),
    Quotation.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    }),
    Receipt.countDocuments({ createdAt: { $gte: startDate } }),
    Receipt.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    }),

    // Move type counts (from quotations)
    Quotation.countDocuments({ type: 'International' }),
    Quotation.countDocuments({ type: 'Office' }),
    Quotation.countDocuments({ type: 'Residential' }),

    // Revenue
    Receipt.aggregate([
      { $match: { 'payment.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
    ]).then(result => result[0]?.total || 0),
    Receipt.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: { $gte: startDate }
        }
      },
      { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
    ]).then(result => result[0]?.total || 0),
    Receipt.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: { $gte: previousPeriodStart, $lt: startDate }
        }
      },
      { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
    ]).then(result => result[0]?.total || 0),

    // Status breakdowns
    Quotation.aggregate([
      { $group: { _id: '$validity.status', count: { $sum: 1 } } }
    ]),
    Receipt.aggregate([
      { $group: { _id: '$receiptType', count: { $sum: 1 } } }
    ]),
    Receipt.aggregate([
      { $group: { _id: '$payment.status', count: { $sum: 1 } } }
    ]),

    // Recent activity (filter by user role)
    Quotation.find(req.user.role === 'admin' ? {} : { createdBy: req.user._id })
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select(
        'quotationNumber type client pricing validity.status createdAt createdBy'
      ),
    Receipt.find(req.user.role === 'admin' ? {} : { createdBy: req.user._id })
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('receiptNumber client payment createdAt createdBy'),

    // Notifications (for current user)
    req.user ? Notification.getUnreadCountForUser(req.user.id) : 0
  ]);

  // Calculate percentage changes
  const calculateChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return (((current - previous) / previous) * 100).toFixed(1);
  };

  // Format status breakdowns
  const formatStatusBreakdown = data => {
    return data.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  };

  const stats = {
    period,
    // Add fields that tests expect at root level
    totalUsers,
    totalQuotations,
    totalReceipts,
    internationalOrders,
    officeMoves,
    residentialMoves,
    overview: {
      totalUsers: {
        count: totalUsers,
        active: activeUsers,
        change: calculateChange(newUsersThisPeriod, newUsersPreviousPeriod)
      },
      totalDocuments: {
        quotations: totalQuotations,
        receipts: totalReceipts,
        quotationsChange: calculateChange(
          quotationsThisPeriod,
          quotationsPreviousPeriod
        ),
        receiptsChange: calculateChange(
          receiptsThisPeriod,
          receiptsPreviousPeriod
        )
      },
      revenue: {
        total: totalRevenue,
        current: revenueThisPeriod,
        change: calculateChange(revenueThisPeriod, revenuePreviousPeriod),
        currency: process.env.DEFAULT_CURRENCY || 'UGX'
      },
      notifications: {
        unread: unreadNotificationsCount
      }
    },
    breakdowns: {
      quotationsByStatus: formatStatusBreakdown(quotationsByStatus),
      receiptsByStatus: formatStatusBreakdown(receiptsByStatus),
      receiptsByPaymentStatus: formatStatusBreakdown(receiptsByPaymentStatus)
    },
    recentActivity: {
      quotations: recentQuotations,
      receipts: recentReceipts
    },
    dateRange: {
      start: startDate,
      end: now,
      period: `${days} days`
    }
  };

  ApiResponse.success(
    res,
    stats,
    'Dashboard statistics retrieved successfully'
  );
});

/**
 * Get recent documents
 * GET /api/dashboard/recent
 */
const getRecentDocuments = asyncHandler(async (req, res) => {
  const {
    limit = 10,
    type = 'all', // 'quotations', 'receipts', or 'all'
    status = 'all'
  } = req.query;

  const limitNum = parseInt(limit);
  const results = {};

  if (type === 'quotations' || type === 'all') {
    const quotationFilter =
      status !== 'all' ? { 'validity.status': status } : {};
    results.quotations = await Quotation.find(quotationFilter)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select('quotationNumber type client pricing validity createdAt createdBy');
  }

  if (type === 'receipts' || type === 'all') {
    const receiptFilter = status !== 'all' ? { 'payment.status': status } : {};
    results.receipts = await Receipt.find(receiptFilter)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select('receiptNumber client payment createdAt createdBy');
  }

  // Merge all documents for the test
  const allDocuments = [];
  if (results.quotations) allDocuments.push(...results.quotations);
  if (results.receipts) allDocuments.push(...results.receipts);

  ApiResponse.success(
    res,
    {
      ...results,
      documents: allDocuments.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
    },
    'Recent documents retrieved successfully'
  );
});

/**
 * Get user performance report
 * GET /api/reports/user-performance
 */
const getUserPerformanceReport = asyncHandler(async (req, res) => {
  const { period = '30d', userId } = req.query;

  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const matchFilter = { createdAt: { $gte: startDate } };
  if (userId) {
    matchFilter.createdBy = userId;
  }

  const [quotationStats, receiptStats, userList] = await Promise.all([
    Quotation.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$createdBy',
          quotationCount: { $sum: 1 },
          totalQuotationValue: { $sum: '$pricing.totalAmount' },
          convertedQuotations: {
            $sum: { $cond: ['$converted', 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $sort: { quotationCount: -1 } }
    ]),

    Receipt.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$createdBy',
          receiptCount: { $sum: 1 },
          totalReceiptValue: { $sum: '$payment.totalAmount' },
          paidReceipts: {
            $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, 1, 0] }
          }
        }
      }
    ]),

    User.find({ status: 'active' }).select('fullName email role')
  ]);

  // Merge quotation and receipt stats
  const performanceMap = new Map();

  // Add quotation stats
  quotationStats.forEach(stat => {
    performanceMap.set(stat._id.toString(), {
      user: stat.user,
      quotationCount: stat.quotationCount,
      totalQuotationValue: stat.totalQuotationValue,
      convertedQuotations: stat.convertedQuotations,
      conversionRate: (
        (stat.convertedQuotations / stat.quotationCount) *
        100
      ).toFixed(1),
      receiptCount: 0,
      totalReceiptValue: 0,
      paidReceipts: 0
    });
  });

  // Add receipt stats
  receiptStats.forEach(stat => {
    const userId = stat._id.toString();
    if (performanceMap.has(userId)) {
      const existing = performanceMap.get(userId);
      existing.receiptCount = stat.receiptCount;
      existing.totalReceiptValue = stat.totalReceiptValue;
      existing.paidReceipts = stat.paidReceipts;
      existing.paymentRate = (
        (stat.paidReceipts / stat.receiptCount) *
        100
      ).toFixed(1);
    } else {
      const user = userList.find(u => u._id.toString() === userId);
      if (user) {
        performanceMap.set(userId, {
          user,
          quotationCount: 0,
          totalQuotationValue: 0,
          convertedQuotations: 0,
          conversionRate: 0,
          receiptCount: stat.receiptCount,
          totalReceiptValue: stat.totalReceiptValue,
          paidReceipts: stat.paidReceipts,
          paymentRate: ((stat.paidReceipts / stat.receiptCount) * 100).toFixed(
            1
          )
        });
      }
    }
  });

  const performance = Array.from(performanceMap.values());

  ApiResponse.success(
    res,
    {
      period: `${days} days`,
      totalUsers: performance.length,
      performance: performance.sort(
        (a, b) =>
          b.quotationCount +
          b.receiptCount -
          (a.quotationCount + a.receiptCount)
      )
    },
    'User performance report retrieved successfully'
  );
});

/**
 * Get document statistics report
 * GET /api/reports/document-stats
 */
const getDocumentStatsReport = asyncHandler(async (req, res) => {
  const { period = '30d', granularity = 'daily' } = req.query;

  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const dateGroupFormat = {
    daily: {
      $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
    },
    weekly: {
      $dateToString: { format: '%Y-W%U', date: '$createdAt' }
    },
    monthly: {
      $dateToString: { format: '%Y-%m', date: '$createdAt' }
    }
  };

  const [quotationTrends, receiptTrends, statusDistribution] =
    await Promise.all([
      Quotation.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: dateGroupFormat[granularity],
            count: { $sum: 1 },
            totalValue: { $sum: '$pricing.totalAmount' },
            converted: {
              $sum: { $cond: ['$convertedToReceipt.receiptId', 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Receipt.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: dateGroupFormat[granularity],
            count: { $sum: 1 },
            totalValue: { $sum: '$payment.totalAmount' },
            paid: {
              $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Promise.all([
        Quotation.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          { $group: { _id: '$validity.status', count: { $sum: 1 } } }
        ]),
        Receipt.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          { $group: { _id: '$payment.status', count: { $sum: 1 } } }
        ])
      ])
    ]);

  ApiResponse.success(
    res,
    {
      period: `${days} days`,
      granularity,
      trends: {
        quotations: quotationTrends,
        receipts: receiptTrends
      },
      distribution: {
        quotationStatus: statusDistribution[0],
        receiptPaymentStatus: statusDistribution[1]
      },
      dateRange: {
        start: startDate,
        end: new Date()
      }
    },
    'Document statistics report retrieved successfully'
  );
});

module.exports = {
  getDashboardStats,
  getRecentDocuments,
  getUserPerformanceReport,
  getDocumentStatsReport
};
