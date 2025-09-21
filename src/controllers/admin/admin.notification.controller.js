/**
 * Admin Notification Controller
 * Handles admin-specific notification management operations
 */

const Notification = require('../../models/Notification.model');
const User = require('../../models/User.model');
const ApiResponse = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler.middleware');
const { validationResult } = require('express-validator');
const notificationLifecycleJob = require('../../jobs/notificationLifecycle.job');
const notificationCleanupJob = require('../../jobs/notificationCleanup.job');
const notificationReadStatusJob = require('../../jobs/notificationReadStatus.job');

/**
 * Get notification summary for admin dashboard
 * GET /api/admin/notifications/summary
 */
const getNotificationSummary = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    groupBy = 'notificationGroup',
    sortBy = 'oldestCreated',
    sortOrder = 'asc',
    lifecycleStatus = '',
    type = '',
    dateFrom = '',
    dateTo = ''
  } = req.query;

  // Build aggregation pipeline
  const matchStage = {
    adminManaged: true
  };

  // Filter by lifecycle status
  if (lifecycleStatus) {
    matchStage.lifecycleStatus = lifecycleStatus;
  }

  // Filter by type
  if (type) {
    matchStage.type = type;
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    matchStage.createdAt = {};
    if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
    if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
  }

  const aggregationPipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: `$${groupBy}`,
        count: { $sum: 1 },
        types: { $addToSet: '$type' },
        lifecycleStatuses: { $addToSet: '$lifecycleStatus' },
        priorities: { $addToSet: '$priority' },
        oldestCreated: { $min: '$createdAt' },
        newestCreated: { $max: '$createdAt' },
        reminderSentAt: { $first: '$reminderSentAt' },
        extendedUntil: { $max: '$extendedUntil' },
        totalRecipients: { $sum: { $size: '$recipientUserIds' } },
        readByAllCount: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        sampleNotification: { $first: '$$ROOT' }
      }
    },
    {
      $addFields: {
        readPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$readByAllCount', '$count'] }, 100] },
            1
          ]
        },
        daysSinceOldest: {
          $divide: [
            { $subtract: [new Date(), '$oldestCreated'] },
            86400000 // milliseconds in a day
          ]
        },
        isUrgent: {
          $gt: [
            {
              $divide: [{ $subtract: [new Date(), '$oldestCreated'] }, 86400000]
            },
            35
          ]
        }
      }
    },
    {
      $sort: {
        [sortBy]: sortOrder === 'desc' ? -1 : 1
      }
    }
  ];

  // Get paginated results
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const totalGroups = await Notification.aggregate([
    ...aggregationPipeline,
    { $count: 'total' }
  ]);

  const groups = await Notification.aggregate([
    ...aggregationPipeline,
    { $skip: skip },
    { $limit: parseInt(limit) }
  ]);

  // Get overall statistics
  const overallStats = await Notification.aggregate([
    { $match: { adminManaged: true } },
    {
      $group: {
        _id: null,
        totalNotifications: { $sum: 1 },
        activeCount: {
          $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'active'] }, 1, 0] }
        },
        pendingReviewCount: {
          $sum: {
            $cond: [{ $eq: ['$lifecycleStatus', 'pending_review'] }, 1, 0]
          }
        },
        extendedCount: {
          $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'extended'] }, 1, 0] }
        },
        archivedCount: {
          $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'archived'] }, 1, 0] }
        },
        totalReadByAll: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        urgentCount: {
          $sum: {
            $cond: [
              {
                $gt: [
                  {
                    $divide: [
                      { $subtract: [new Date(), '$createdAt'] },
                      86400000
                    ]
                  },
                  35
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const stats = overallStats[0] || {
    totalNotifications: 0,
    activeCount: 0,
    pendingReviewCount: 0,
    extendedCount: 0,
    archivedCount: 0,
    totalReadByAll: 0,
    urgentCount: 0
  };

  stats.overallReadPercentage =
    stats.totalNotifications > 0
      ? Math.round((stats.totalReadByAll / stats.totalNotifications) * 100)
      : 0;

  return ApiResponse.success(
    res,
    {
      groups,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((totalGroups[0]?.total || 0) / parseInt(limit)),
        totalGroups: totalGroups[0]?.total || 0,
        limit: parseInt(limit)
      },
      overallStats,
      filters: {
        groupBy,
        sortBy,
        sortOrder,
        lifecycleStatus,
        type,
        dateFrom,
        dateTo
      }
    },
    'Notification summary retrieved successfully'
  );
});

/**
 * Get notifications pending admin review
 * GET /api/admin/notifications/pending-review
 */
const getPendingReview = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'oldestCreated',
    sortOrder = 'asc'
  } = req.query;

  const report = await notificationLifecycleJob.getPendingReviewReport();

  // Get detailed pending notifications with pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const pendingNotifications = await Notification.find({
    lifecycleStatus: 'pending_review'
  })
    .populate('userId', 'name email')
    .populate('recipientUserIds', 'name email')
    .populate('actorId', 'name email')
    .sort({
      [sortBy === 'oldestCreated' ? 'createdAt' : sortBy]:
        sortOrder === 'desc' ? -1 : 1
    })
    .skip(skip)
    .limit(parseInt(limit));

  const totalPending = await Notification.countDocuments({
    lifecycleStatus: 'pending_review'
  });

  return ApiResponse.success(
    res,
    {
      notifications: pendingNotifications,
      report,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPending / parseInt(limit)),
        totalNotifications: totalPending,
        limit: parseInt(limit)
      }
    },
    'Pending review notifications retrieved successfully'
  );
});

/**
 * Bulk delete notifications
 * DELETE /api/admin/notifications/bulk-delete
 */
const bulkDeleteNotifications = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(res, 'Validation failed', 400, errors.array());
  }

  const {
    notificationIds = [],
    criteria = {},
    confirmDeletion = false
  } = req.body;

  if (!confirmDeletion) {
    return ApiResponse.error(
      res,
      'Confirmation required for bulk deletion',
      400
    );
  }

  const deleteFilter = {};

  // If specific notification IDs provided
  if (notificationIds && notificationIds.length > 0) {
    deleteFilter._id = { $in: notificationIds };
  }

  // If criteria provided
  if (Object.keys(criteria).length > 0) {
    // Build filter from criteria
    if (criteria.lifecycleStatus) {
      deleteFilter.lifecycleStatus = criteria.lifecycleStatus;
    }
    if (criteria.type) {
      deleteFilter.type = criteria.type;
    }
    if (criteria.isReadByAllUsers !== undefined) {
      deleteFilter.isReadByAllUsers = criteria.isReadByAllUsers;
    }
    if (criteria.olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - criteria.olderThanDays);
      deleteFilter.createdAt = { $lt: cutoffDate };
    }
    if (criteria.notificationGroup) {
      deleteFilter.notificationGroup = criteria.notificationGroup;
    }
  }

  // Safety check - prevent accidental deletion of all notifications
  if (Object.keys(deleteFilter).length === 0) {
    return ApiResponse.error(res, 'No valid deletion criteria provided', 400);
  }

  // Add admin managed filter for safety
  deleteFilter.adminManaged = true;

  // Get notifications to be deleted (for logging)
  const notificationsToDelete = await Notification.find(deleteFilter).select(
    '_id type title createdAt'
  );

  if (notificationsToDelete.length === 0) {
    return ApiResponse.success(
      res,
      {
        deletedCount: 0,
        deletedNotifications: []
      },
      'No notifications matched the deletion criteria'
    );
  }

  // Perform bulk deletion
  const deleteResult = await Notification.deleteMany(deleteFilter);

  // Log the deletion for audit trail
  console.log(
    `🗑️ Admin bulk deletion: ${deleteResult.deletedCount} notifications deleted by admin ${req.user._id}`
  );
  console.log('🗑️ Deletion criteria:', deleteFilter);

  return ApiResponse.success(
    res,
    {
      deletedCount: deleteResult.deletedCount,
      deletedNotifications: notificationsToDelete.map(n => ({
        id: n._id,
        type: n.type,
        title: n.title,
        createdAt: n.createdAt
      }))
    },
    `Successfully deleted ${deleteResult.deletedCount} notifications`
  );
});

/**
 * Extend notification lifecycle
 * PUT /api/admin/notifications/:id/extend
 */
const extendNotificationLifecycle = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(res, 'Validation failed', 400, errors.array());
  }

  const { id } = req.params;
  const { extendDays = 30, reason = '' } = req.body;

  // Find the notification
  const notification = await Notification.findById(id);
  if (!notification) {
    return ApiResponse.error(res, 'Notification not found', 404);
  }

  if (!notification.adminManaged) {
    return ApiResponse.error(
      res,
      'This notification is not admin managed',
      403
    );
  }

  // Calculate new expiry date
  const currentExpiry =
    notification.extendedUntil || notification.expiresAt || new Date();
  const newExpiryDate = new Date(currentExpiry);
  newExpiryDate.setDate(newExpiryDate.getDate() + parseInt(extendDays));

  // Update notification
  notification.lifecycleStatus = 'extended';
  notification.extendedUntil = newExpiryDate;
  notification.expiresAt = newExpiryDate;

  // Add extension metadata
  if (!notification.metadata) {
    notification.metadata = {};
  }
  notification.metadata.extensions = notification.metadata.extensions || [];
  notification.metadata.extensions.push({
    extendedBy: req.user._id,
    extendedAt: new Date(),
    extendDays: parseInt(extendDays),
    reason: reason,
    previousExpiry: currentExpiry
  });

  await notification.save();

  // Log the extension
  console.log(
    `📅 Notification ${id} extended by ${extendDays} days by admin ${req.user._id}. Reason: ${reason}`
  );

  return ApiResponse.success(
    res,
    {
      notification: {
        id: notification._id,
        title: notification.title,
        lifecycleStatus: notification.lifecycleStatus,
        extendedUntil: notification.extendedUntil,
        expiresAt: notification.expiresAt,
        extensionHistory: notification.metadata.extensions
      }
    },
    `Notification lifecycle extended by ${extendDays} days`
  );
});

/**
 * Update notification settings
 * PUT /api/admin/notifications/settings
 */
const updateNotificationSettings = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(res, 'Validation failed', 400, errors.array());
  }

  const {
    autoDeleteReadNotifications = false,
    maxRetentionDays = 30,
    reminderDaysBeforeExpiry = 1,
    importantNotificationTypes = ['payment_overdue', 'security_alert'],
    autoExtendImportant = true,
    notificationBatchSize = 100
  } = req.body;

  // For now, we'll store settings in a simple configuration
  // In a production app, you might want to store this in a dedicated Settings model
  const settings = {
    autoDeleteReadNotifications,
    maxRetentionDays: Math.max(1, Math.min(365, parseInt(maxRetentionDays))), // 1-365 days
    reminderDaysBeforeExpiry: Math.max(
      1,
      Math.min(7, parseInt(reminderDaysBeforeExpiry))
    ), // 1-7 days
    importantNotificationTypes,
    autoExtendImportant,
    notificationBatchSize: Math.max(
      10,
      Math.min(1000, parseInt(notificationBatchSize))
    ), // 10-1000
    updatedBy: req.user._id,
    updatedAt: new Date()
  };

  // Store settings in environment or database (simplified for this implementation)
  // You could create a Settings model for persistent storage
  global.notificationSettings = settings;

  console.log(`⚙️ Notification settings updated by admin ${req.user._id}`);

  return ApiResponse.success(
    res,
    {
      settings
    },
    'Notification settings updated successfully'
  );
});

/**
 * Get current notification settings
 * GET /api/admin/notifications/settings
 */
const getNotificationSettings = asyncHandler(async (req, res) => {
  // Get current settings (default values if not set)
  const defaultSettings = {
    autoDeleteReadNotifications: false,
    maxRetentionDays: 30,
    reminderDaysBeforeExpiry: 1,
    importantNotificationTypes: ['payment_overdue', 'security_alert'],
    autoExtendImportant: true,
    notificationBatchSize: 100
  };

  const currentSettings = global.notificationSettings || defaultSettings;

  return ApiResponse.success(
    res,
    {
      settings: currentSettings
    },
    'Notification settings retrieved successfully'
  );
});

/**
 * Get notification analytics
 * GET /api/admin/notifications/analytics
 */
const getNotificationAnalytics = asyncHandler(async (req, res) => {
  const {
    dateFrom = '',
    dateTo = '',
    groupBy = 'day' // day, week, month
  } = req.query;

  // Build date filter
  const dateFilter = {};
  if (dateFrom) dateFilter.$gte = new Date(dateFrom);
  if (dateTo) dateFilter.$lte = new Date(dateTo);

  // Get analytics data
  const analytics = await Notification.aggregate([
    {
      $match: {
        adminManaged: true,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          lifecycleStatus: '$lifecycleStatus',
          date: {
            $dateToString: {
              format:
                groupBy === 'day'
                  ? '%Y-%m-%d'
                  : groupBy === 'week'
                    ? '%Y-%U'
                    : '%Y-%m',
              date: '$createdAt'
            }
          }
        },
        count: { $sum: 1 },
        readCount: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        avgProcessingTime: {
          $avg: {
            $cond: ['$readAt', { $subtract: ['$readAt', '$createdAt'] }, null]
          }
        }
      }
    },
    {
      $group: {
        _id: {
          type: '$_id.type',
          date: '$_id.date'
        },
        totalCount: { $sum: '$count' },
        totalReadCount: { $sum: '$readCount' },
        lifecycleBreakdown: {
          $push: {
            status: '$_id.lifecycleStatus',
            count: '$count'
          }
        },
        avgProcessingTime: { $avg: '$avgProcessingTime' }
      }
    },
    {
      $sort: {
        '_id.date': 1,
        '_id.type': 1
      }
    }
  ]);

  // Get summary statistics
  const summary = await Notification.aggregate([
    {
      $match: {
        adminManaged: true,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
      }
    },
    {
      $group: {
        _id: null,
        totalNotifications: { $sum: 1 },
        totalRead: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        avgLifecycleDays: {
          $avg: {
            $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000]
          }
        },
        typeBreakdown: {
          $push: {
            type: '$type',
            count: 1
          }
        }
      }
    }
  ]);

  return ApiResponse.success(
    res,
    {
      analytics,
      summary: summary[0] || {},
      period: {
        from: dateFrom || 'Beginning',
        to: dateTo || 'Now',
        groupBy
      }
    },
    'Notification analytics retrieved successfully'
  );
});

/**
 * Force run lifecycle job manually
 * POST /api/admin/notifications/run-lifecycle-job
 */
const runLifecycleJob = asyncHandler(async (req, res) => {
  try {
    console.log(`🔧 Manual lifecycle job triggered by admin ${req.user._id}`);

    await notificationLifecycleJob.runNow();

    const stats = notificationLifecycleJob.getStats();

    return ApiResponse.success(
      res,
      {
        jobStats: stats,
        executedBy: req.user._id,
        executedAt: new Date()
      },
      'Lifecycle job executed successfully'
    );
  } catch (error) {
    console.error('❌ Manual lifecycle job failed:', error);
    return ApiResponse.error(
      res,
      'Failed to execute lifecycle job',
      500,
      error.message
    );
  }
});

/**
 * Force run cleanup job manually
 * POST /api/admin/notifications/run-cleanup-job
 */
const runCleanupJob = asyncHandler(async (req, res) => {
  try {
    console.log(`🧹 Manual cleanup job triggered by admin ${req.user._id}`);

    await notificationCleanupJob.runNow();

    const stats = notificationCleanupJob.getStats();

    return ApiResponse.success(
      res,
      {
        jobStats: stats,
        executedBy: req.user._id,
        executedAt: new Date()
      },
      'Cleanup job executed successfully'
    );
  } catch (error) {
    console.error('❌ Manual cleanup job failed:', error);
    return ApiResponse.error(
      res,
      'Failed to execute cleanup job',
      500,
      error.message
    );
  }
});

/**
 * Get cleanup dry run preview
 * GET /api/admin/notifications/cleanup-preview
 */
const getCleanupPreview = asyncHandler(async (req, res) => {
  try {
    const dryRunResult = await notificationCleanupJob.dryRun();

    return ApiResponse.success(
      res,
      {
        preview: dryRunResult,
        generatedBy: req.user._id,
        generatedAt: new Date()
      },
      'Cleanup preview generated successfully'
    );
  } catch (error) {
    console.error('❌ Cleanup preview failed:', error);
    return ApiResponse.error(
      res,
      'Failed to generate cleanup preview',
      500,
      error.message
    );
  }
});

/**
 * Get enhanced system monitoring and performance metrics
 * GET /api/admin/notifications/system-health
 */
const getSystemHealth = asyncHandler(async (req, res) => {
  try {
    // Get all job statistics
    const lifecycleStats = notificationLifecycleJob.getStats();
    const cleanupStats = notificationCleanupJob.getStats();
    const readStatusStats = notificationReadStatusJob.getStats();

    // Get storage and performance metrics
    const storageStats = await notificationCleanupJob.getStorageStatistics();

    // Get database performance metrics
    const dbMetrics = await getDetailedDatabaseMetrics();

    // Get notification creation and read rates
    const performanceMetrics = await getPerformanceMetrics();

    // Calculate system health score
    const healthScore = calculateSystemHealthScore({
      lifecycle: lifecycleStats,
      cleanup: cleanupStats,
      readStatus: readStatusStats,
      storage: storageStats,
      performance: performanceMetrics
    });

    return ApiResponse.success(
      res,
      {
        healthScore,
        jobs: {
          lifecycle: lifecycleStats,
          cleanup: cleanupStats,
          readStatus: readStatusStats
        },
        storage: storageStats,
        database: dbMetrics,
        performance: performanceMetrics,
        alerts: generateSystemAlerts({
          lifecycle: lifecycleStats,
          cleanup: cleanupStats,
          storage: storageStats,
          performance: performanceMetrics
        }),
        generatedAt: new Date()
      },
      'System health report generated successfully'
    );
  } catch (error) {
    console.error('❌ System health check failed:', error);
    return ApiResponse.error(
      res,
      'Failed to get system health',
      500,
      error.message
    );
  }
});

/**
 * Get detailed database performance metrics
 */
async function getDetailedDatabaseMetrics() {
  try {
    // Index usage statistics
    const indexStats = await Notification.collection
      .aggregate([{ $indexStats: {} }])
      .toArray();

    // Collection stats
    const collStats = await Notification.collection.stats();

    // Query performance for common operations
    const commonQueries = await Promise.all([
      // Time to find unread notifications
      measureQueryTime(() =>
        Notification.find({ read: false }).limit(10).explain('executionStats')
      ),

      // Time to find pending review notifications
      measureQueryTime(() =>
        Notification.find({ lifecycleStatus: 'pending_review' })
          .limit(10)
          .explain('executionStats')
      ),

      // Time to aggregate notification summary
      measureQueryTime(() =>
        Notification.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]).explain('executionStats')
      )
    ]);

    return {
      indexUsage: indexStats,
      collectionSize: {
        documents: collStats.count,
        avgObjSize: collStats.avgObjSize,
        dataSize: collStats.size,
        indexSize: collStats.totalIndexSize
      },
      queryPerformance: {
        unreadQuery: commonQueries[0],
        pendingReviewQuery: commonQueries[1],
        aggregationQuery: commonQueries[2]
      }
    };
  } catch (error) {
    console.error('❌ Error getting database metrics:', error);
    return { error: error.message };
  }
}

/**
 * Measure query execution time
 */
async function measureQueryTime(queryFn) {
  const startTime = Date.now();
  try {
    const result = await queryFn();
    const executionTime = Date.now() - startTime;

    return {
      executionTimeMs: executionTime,
      success: true,
      stats: result?.executionStats || result
    };
  } catch (error) {
    return {
      executionTimeMs: Date.now() - startTime,
      success: false,
      error: error.message
    };
  }
}

/**
 * Get performance metrics
 */
async function getPerformanceMetrics() {
  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const metrics = await Notification.aggregate([
      {
        $facet: {
          // Notification creation rate
          creationRate24h: [
            { $match: { createdAt: { $gte: last24Hours } } },
            {
              $group: {
                _id: { $hour: '$createdAt' },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],

          // Read rate by type
          readRateByType: [
            { $match: { createdAt: { $gte: last7Days } } },
            {
              $group: {
                _id: '$type',
                total: { $sum: 1 },
                read: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } }
              }
            },
            {
              $addFields: {
                readPercentage: {
                  $multiply: [{ $divide: ['$read', '$total'] }, 100]
                }
              }
            },
            { $sort: { total: -1 } }
          ],

          // Admin action rate
          adminActionRate: [
            {
              $match: {
                lifecycleStatus: { $in: ['extended', 'archived'] },
                'metadata.extensions': { $exists: true }
              }
            },
            {
              $group: {
                _id: null,
                totalActions: { $sum: 1 },
                avgResponseTime: {
                  $avg: {
                    $subtract: [
                      { $ifNull: ['$reminderSentAt', '$createdAt'] },
                      '$createdAt'
                    ]
                  }
                }
              }
            }
          ],

          // Storage growth trend
          storageGrowth: [
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' },
                  day: { $dayOfMonth: '$createdAt' }
                },
                count: { $sum: 1 },
                avgSize: {
                  $avg: {
                    $strLenCP: {
                      $convert: {
                        input: '$$ROOT',
                        to: 'string',
                        onError: 'null'
                      }
                    }
                  }
                }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 } // Last 30 days
          ]
        }
      }
    ]);

    return metrics[0] || {};
  } catch (error) {
    console.error('❌ Error getting performance metrics:', error);
    return { error: error.message };
  }
}

/**
 * Calculate overall system health score
 */
function calculateSystemHealthScore(data) {
  let score = 100;
  const issues = [];

  // Job health (30 points)
  const jobs = [data.lifecycle, data.cleanup, data.readStatus];
  jobs.forEach(job => {
    if (job.errors > 0) {
      const errorRate = job.errors / Math.max(job.totalRuns, 1);
      if (errorRate > 0.1) {
        score -= 10;
        issues.push(
          `High error rate in ${job.name || 'job'}: ${(errorRate * 100).toFixed(1)}%`
        );
      }
    }

    if (job.lastRun) {
      const hoursSinceLastRun =
        (Date.now() - new Date(job.lastRun).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun > 48) {
        score -= 5;
        issues.push(`Job hasn't run in ${hoursSinceLastRun.toFixed(1)} hours`);
      }
    }
  });

  // Storage health (25 points)
  if (data.storage.totalNotifications > 50000) {
    score -= 10;
    issues.push(`High notification count: ${data.storage.totalNotifications}`);
  }

  if (data.storage.estimatedSizeMB > 100) {
    score -= 10;
    issues.push(`Large storage usage: ${data.storage.estimatedSizeMB}MB`);
  }

  if (data.storage.readPercentage < 70) {
    score -= 5;
    issues.push(`Low read rate: ${data.storage.readPercentage}%`);
  }

  // Performance health (25 points)
  if (
    data.performance.creationRate24h &&
    data.performance.creationRate24h.length > 0
  ) {
    const avgCreationRate =
      data.performance.creationRate24h.reduce(
        (sum, hour) => sum + hour.count,
        0
      ) / 24;
    if (avgCreationRate > 100) {
      score -= 15;
      issues.push(
        `High notification creation rate: ${avgCreationRate.toFixed(1)}/hour`
      );
    }
  }

  // System configuration (20 points)
  const config = global.notificationSettings || {};
  if (!config.enableAutoCleanup) {
    score -= 10;
    issues.push('Auto-cleanup is disabled');
  }

  if (!config.autoDeleteReadNotifications && data.storage.readPercentage > 80) {
    score -= 5;
    issues.push('High read rate but auto-delete disabled');
  }

  return {
    score: Math.max(0, score),
    level:
      score >= 90
        ? 'excellent'
        : score >= 75
          ? 'good'
          : score >= 50
            ? 'warning'
            : 'critical',
    issues,
    recommendations: generateRecommendations(data, issues)
  };
}

/**
 * Generate system recommendations
 */
function generateRecommendations(data, issues) {
  const recommendations = [];

  if (issues.some(issue => issue.includes('High notification count'))) {
    recommendations.push(
      'Consider enabling auto-cleanup to reduce notification count'
    );
    recommendations.push('Review notification retention policies');
  }

  if (issues.some(issue => issue.includes('Large storage usage'))) {
    recommendations.push('Run cleanup job to reduce storage usage');
    recommendations.push('Consider archiving old notifications');
  }

  if (issues.some(issue => issue.includes('Low read rate'))) {
    recommendations.push('Review notification content and relevance');
    recommendations.push('Consider user notification preferences');
  }

  if (issues.some(issue => issue.includes('High error rate'))) {
    recommendations.push('Check job logs for recurring errors');
    recommendations.push('Review database connectivity and performance');
  }

  if (issues.some(issue => issue.includes('Auto-cleanup is disabled'))) {
    recommendations.push(
      'Consider enabling auto-cleanup for better maintenance'
    );
  }

  return recommendations;
}

/**
 * Generate system alerts
 */
function generateSystemAlerts(data) {
  const alerts = [];

  // Critical alerts
  if (data.storage.totalNotifications > 100000) {
    alerts.push({
      level: 'critical',
      message:
        'Notification count exceeds 100,000. Immediate cleanup recommended.',
      action: 'Run cleanup job'
    });
  }

  if (data.storage.estimatedSizeMB > 500) {
    alerts.push({
      level: 'critical',
      message:
        'Notification storage exceeds 500MB. Database performance may be affected.',
      action: 'Enable auto-cleanup and archive old notifications'
    });
  }

  // Warning alerts
  if (data.performance.creationRate24h) {
    const totalCreated = data.performance.creationRate24h.reduce(
      (sum, hour) => sum + hour.count,
      0
    );
    if (totalCreated > 5000) {
      alerts.push({
        level: 'warning',
        message: `High notification creation rate: ${totalCreated} in last 24 hours`,
        action: 'Review notification triggers and consider rate limiting'
      });
    }
  }

  if (data.storage.readPercentage < 50) {
    alerts.push({
      level: 'warning',
      message: `Low notification read rate: ${data.storage.readPercentage}%`,
      action: 'Review notification content and delivery methods'
    });
  }

  return alerts;
}

/**
 * Format group name for better display
 */
function formatGroupName(groupName) {
  if (!groupName) return 'Unknown Group';

  // Extract meaningful parts from the group name
  // Group names are typically like: document_updated_quotation_12345_2024_12_18
  const parts = groupName.split('_');

  if (parts.length >= 3) {
    const type = parts[0];
    const subtype = parts[1];

    // If it contains a document ID or reference
    if (parts.length >= 4 && !isNaN(parts[3])) {
      const documentId = parts[3];
      const date = parts.slice(4).join('-');
      return `${subtype.charAt(0).toUpperCase() + subtype.slice(1)} ${documentId} (${date})`;
    }

    // If it's a batch or daily group
    if (parts.includes('batch')) {
      const batchIndex = parts.indexOf('batch');
      const batchNumber = parts[batchIndex + 1] || '001';
      return `${subtype.charAt(0).toUpperCase() + subtype.slice(1)} Batch ${batchNumber}`;
    }

    // If it's a date-based group
    if (
      parts.length >= 5 &&
      !isNaN(parts[2]) &&
      !isNaN(parts[3]) &&
      !isNaN(parts[4])
    ) {
      const date = `${parts[2]}-${parts[3]}-${parts[4]}`;
      return `${subtype.charAt(0).toUpperCase() + subtype.slice(1)} (${date})`;
    }
  }

  // Fallback: just clean up the group name
  return (
    groupName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .substring(0, 50) + (groupName.length > 50 ? '...' : '')
  );
}

/**
 * Get notification group breakdown stats
 * GET /api/admin/notifications/group-stats
 */
const getGroupStats = asyncHandler(async (req, res) => {
  try {
    // First, get detailed group information with actual group names and their notifications
    const detailedGroupStats = await Notification.aggregate([
      {
        $match: {
          adminManaged: true
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            notificationGroup: '$notificationGroup'
          },
          notifications: {
            $push: {
              _id: '$_id',
              title: '$title',
              message: '$message',
              createdAt: '$createdAt',
              isReadByAllUsers: '$isReadByAllUsers',
              priority: '$priority'
            }
          },
          notificationCount: { $sum: 1 },
          readCount: {
            $sum: { $cond: [{ $eq: ['$isReadByAllUsers', true] }, 1, 0] }
          },
          unreadCount: {
            $sum: { $cond: [{ $eq: ['$isReadByAllUsers', false] }, 1, 0] }
          },
          latestCreated: { $max: '$createdAt' },
          oldestCreated: { $min: '$createdAt' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          groups: {
            $push: {
              groupName: '$_id.notificationGroup',
              notifications: '$notifications',
              notificationCount: '$notificationCount',
              readCount: '$readCount',
              unreadCount: '$unreadCount',
              latestCreated: '$latestCreated',
              oldestCreated: '$oldestCreated'
            }
          },
          totalNotifications: { $sum: '$notificationCount' },
          totalReadCount: { $sum: '$readCount' },
          totalUnreadCount: { $sum: '$unreadCount' },
          groupCount: { $sum: 1 },
          latestActivity: { $max: '$latestCreated' },
          oldestActivity: { $min: '$oldestCreated' }
        }
      },
      {
        $project: {
          type: '$_id',
          groups: 1,
          totalNotifications: 1,
          totalReadCount: 1,
          totalUnreadCount: 1,
          groupCount: 1,
          latestActivity: 1,
          oldestActivity: 1,
          description: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$_id', 'document_created'] },
                  then: 'New documents created in the system'
                },
                {
                  case: { $eq: ['$_id', 'document_updated'] },
                  then: 'Documents that were modified'
                },
                {
                  case: { $eq: ['$_id', 'document_deleted'] },
                  then: 'Documents that were deleted'
                },
                {
                  case: { $eq: ['$_id', 'quotation_expired'] },
                  then: 'Quotations that have expired'
                },
                {
                  case: { $eq: ['$_id', 'quotation_converted'] },
                  then: 'Quotations converted to receipts'
                },
                {
                  case: { $eq: ['$_id', 'payment_received'] },
                  then: 'Payment confirmations received'
                },
                {
                  case: { $eq: ['$_id', 'payment_overdue'] },
                  then: 'Overdue payment notifications'
                },
                {
                  case: { $eq: ['$_id', 'user_created'] },
                  then: 'New users added to the system'
                },
                {
                  case: { $eq: ['$_id', 'user_updated'] },
                  then: 'User profile updates'
                },
                {
                  case: { $eq: ['$_id', 'user_role_changed'] },
                  then: 'User role modifications'
                },
                {
                  case: { $eq: ['$_id', 'user_deleted'] },
                  then: 'Users removed from the system'
                },
                {
                  case: { $eq: ['$_id', 'user_suspended'] },
                  then: 'User account suspensions'
                },
                {
                  case: { $eq: ['$_id', 'user_reactivated'] },
                  then: 'User account reactivations'
                },
                {
                  case: { $eq: ['$_id', 'profile_incomplete'] },
                  then: 'Incomplete user profiles'
                },
                {
                  case: { $eq: ['$_id', 'system_maintenance'] },
                  then: 'System maintenance notifications'
                },
                {
                  case: { $eq: ['$_id', 'backup_completed'] },
                  then: 'Backup completion confirmations'
                },
                {
                  case: { $eq: ['$_id', 'security_alert'] },
                  then: 'Security-related alerts'
                }
              ],
              default: 'Other system notifications'
            }
          }
        }
      },
      {
        $sort: { groupCount: -1, totalNotifications: -1 }
      }
    ]);

    // Get total groups count
    const totalGroupsResult = await Notification.aggregate([
      {
        $match: {
          adminManaged: true
        }
      },
      {
        $group: {
          _id: null,
          totalGroups: { $addToSet: '$notificationGroup' }
        }
      },
      {
        $project: {
          totalGroups: { $size: '$totalGroups' }
        }
      }
    ]);

    const totalGroups = totalGroupsResult[0]?.totalGroups || 0;

    // Transform the data for frontend consumption with detailed group information
    const formattedStats = detailedGroupStats.map(stat => ({
      type: stat.type,
      count: stat.groupCount,
      notificationCount: stat.totalNotifications,
      description: stat.description,
      readCount: stat.totalReadCount,
      unreadCount: stat.totalUnreadCount,
      latestActivity: stat.latestActivity,
      oldestActivity: stat.oldestActivity,
      groups: stat.groups.map(group => ({
        groupName: group.groupName,
        notificationCount: group.notificationCount,
        readCount: group.readCount,
        unreadCount: group.unreadCount,
        latestCreated: group.latestCreated,
        oldestCreated: group.oldestCreated,
        // Format group name for better display
        displayName: formatGroupName(group.groupName),
        // Sample notifications (first 3 for preview)
        sampleNotifications: group.notifications.slice(0, 3).map(n => ({
          title: n.title,
          message:
            n.message.substring(0, 100) + (n.message.length > 100 ? '...' : ''),
          createdAt: n.createdAt,
          priority: n.priority,
          isRead: n.isReadByAllUsers
        }))
      }))
    }));

    return ApiResponse.success(
      res,
      {
        groupStats: formattedStats,
        totalGroups,
        summary: {
          totalNotificationTypes: detailedGroupStats.length,
          totalNotifications: detailedGroupStats.reduce(
            (sum, stat) => sum + stat.totalNotifications,
            0
          ),
          totalGroupsCount: totalGroups
        }
      },
      'Group statistics retrieved successfully'
    );
  } catch (error) {
    console.error('❌ Failed to get group stats:', error);
    return ApiResponse.error(
      res,
      'Failed to retrieve group statistics',
      500,
      error.message
    );
  }
});

module.exports = {
  getNotificationSummary,
  getPendingReview,
  bulkDeleteNotifications,
  extendNotificationLifecycle,
  updateNotificationSettings,
  getNotificationSettings,
  getNotificationAnalytics,
  runLifecycleJob,
  runCleanupJob,
  getCleanupPreview,
  getSystemHealth,
  getGroupStats
};
