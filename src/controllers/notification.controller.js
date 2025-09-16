/**
 * Notification Controller
 * Handles notification CRUD operations and user interactions
 */

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const ApiResponse = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { validationResult } = require('express-validator');

/**
 * Get user notifications
 * GET /api/notifications
 */
const getUserNotifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = '',
    priority = ''
  } = req.query;

  const userId = req.user._id;

  // Build filter object
  const filter = { userId };

  if (unreadOnly === 'true') {
    filter.read = false;
  }

  if (type) {
    filter.type = type;
  }

  if (priority) {
    filter.priority = priority;
  }

  // Add expiry filter
  filter.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: {
      path: 'actorId',
      select: 'fullName email'
    }
  };

  const notifications = await Notification.paginate(filter, options);

  ApiResponse.success(
    res,
    notifications,
    'Notifications retrieved successfully'
  );
});

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const count = await Notification.getUnreadCountForUser(userId);

  ApiResponse.success(res, { count }, 'Unread count retrieved successfully');
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await Notification.findOne({
    _id: id,
    userId
  });

  if (!notification) {
    return ApiResponse.error(res, 'Notification not found', 404);
  }

  if (!notification.read) {
    await notification.markAsRead();
  }

  ApiResponse.success(res, notification, 'Notification marked as read');
});

/**
 * Mark notification as unread
 * PUT /api/notifications/:id/unread
 */
const markAsUnread = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await Notification.findOne({
    _id: id,
    userId
  });

  if (!notification) {
    return ApiResponse.error(res, 'Notification not found', 404);
  }

  if (notification.read) {
    await notification.markAsUnread();
  }

  ApiResponse.success(res, notification, 'Notification marked as unread');
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/mark-all-read
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const result = await Notification.markAllAsReadForUser(userId);

  ApiResponse.success(
    res,
    {
      modifiedCount: result.modifiedCount
    },
    `${result.modifiedCount} notifications marked as read`
  );
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await Notification.findOneAndDelete({
    _id: id,
    userId
  });

  if (!notification) {
    return ApiResponse.error(res, 'Notification not found', 404);
  }

  ApiResponse.success(res, null, 'Notification deleted successfully');
});

/**
 * Create notification (Admin only)
 * POST /api/notifications
 */
const createNotification = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(res, 'Validation failed', 400, errors.array());
  }

  const {
    recipientIds,
    type,
    title,
    message,
    priority = 'normal',
    actionUrl,
    actionText,
    metadata
  } = req.body;

  const actorId = req.user.id;

  // Validate recipient IDs
  const validUsers = await User.find({
    _id: { $in: recipientIds },
    status: 'active'
  });

  if (validUsers.length !== recipientIds.length) {
    return ApiResponse.error(res, 'Some recipient IDs are invalid', 400);
  }

  // Create notifications for all recipients
  const notifications = recipientIds.map(userId => ({
    userId,
    type,
    title,
    message,
    priority,
    actionUrl,
    actionText,
    actorId,
    metadata
  }));

  const createdNotifications = await Notification.insertMany(notifications);

  ApiResponse.success(
    res,
    {
      count: createdNotifications.length,
      notifications: createdNotifications
    },
    `${createdNotifications.length} notifications created successfully`
  );
});

/**
 * Get notification statistics (Admin only)
 * GET /api/notifications/stats
 */
const getNotificationStats = asyncHandler(async (req, res) => {
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

  // Get notification statistics
  const [
    totalNotifications,
    totalUnread,
    notificationsByType,
    notificationsByPriority,
    recentNotifications
  ] = await Promise.all([
    Notification.countDocuments({
      createdAt: { $gte: startDate }
    }),

    Notification.countDocuments({
      createdAt: { $gte: startDate },
      read: false
    }),

    Notification.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    Notification.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),

    Notification.find({
      createdAt: { $gte: startDate }
    })
      .populate('userId', 'fullName email')
      .populate('actorId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(10)
  ]);

  const stats = {
    period,
    totalNotifications,
    totalUnread,
    readRate:
      totalNotifications > 0
        ? (
            ((totalNotifications - totalUnread) / totalNotifications) *
            100
          ).toFixed(2)
        : 0,
    notificationsByType: notificationsByType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    notificationsByPriority: notificationsByPriority.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    recentNotifications
  };

  ApiResponse.success(
    res,
    stats,
    'Notification statistics retrieved successfully'
  );
});

/**
 * Delete old notifications (Admin only)
 * DELETE /api/notifications/cleanup
 */
const cleanupOldNotifications = asyncHandler(async (req, res) => {
  const { days = 90 } = req.query;

  const result = await Notification.deleteOldNotifications(parseInt(days));

  ApiResponse.success(
    res,
    {
      deletedCount: result.deletedCount
    },
    `${result.deletedCount} old notifications deleted`
  );
});

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  createNotification,
  getNotificationStats,
  cleanupOldNotifications
};
