/**
 * Notification Routes
 * Handles notification-related endpoints
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  createNotification,
  getNotificationStats,
  cleanupOldNotifications
} = require('../controllers/notification.controller');

// Admin-specific notification management
const {
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
} = require('../controllers/admin/admin.notification.controller');

const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route GET /api/notifications
 * @desc Get user notifications with pagination and filters
 * @access Private
 * @query page, limit, unreadOnly, type, priority
 */
router.get('/', getUserNotifications);

/**
 * @route GET /api/notifications/unread-count
 * @desc Get count of unread notifications for current user
 * @access Private
 */
router.get('/unread-count', getUnreadCount);

/**
 * @route PUT /api/notifications/mark-all-read
 * @desc Mark all notifications as read for current user
 * @access Private
 */
router.put('/mark-all-read', markAllAsRead);

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark specific notification as read
 * @access Private
 */
router.put('/:id/read', markAsRead);

/**
 * @route PUT /api/notifications/:id/unread
 * @desc Mark specific notification as unread
 * @access Private
 */
router.put('/:id/unread', markAsUnread);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete specific notification
 * @access Private
 */
router.delete('/:id', deleteNotification);

// Admin only routes
/**
 * @route POST /api/notifications
 * @desc Create new notification(s) for specified users
 * @access Admin only
 */
router.post(
  '/',
  requireAdmin,
  [
    body('recipientIds')
      .isArray({ min: 1 })
      .withMessage('At least one recipient ID is required'),
    body('recipientIds.*')
      .isMongoId()
      .withMessage('Invalid recipient ID format'),
    body('type')
      .isIn([
        'document_created',
        'document_updated',
        'document_deleted',
        'quotation_expired',
        'quotation_converted',
        'payment_received',
        'payment_overdue',
        'user_created',
        'user_updated',
        'user_role_changed',
        'user_deleted',
        'profile_incomplete',
        'system_maintenance',
        'backup_completed',
        'security_alert'
      ])
      .withMessage('Invalid notification type'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1-100 characters'),
    body('message')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Message must be between 1-500 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    body('actionUrl')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Action URL cannot exceed 200 characters'),
    body('actionText')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Action text cannot exceed 50 characters')
  ],
  createNotification
);

/**
 * @route GET /api/notifications/stats
 * @desc Get notification statistics
 * @access Admin only
 * @query period (7d, 30d, 90d, 1y)
 */
router.get('/stats', requireAdmin, getNotificationStats);

/**
 * @route DELETE /api/notifications/cleanup
 * @desc Delete old read notifications
 * @access Admin only
 * @query days - Number of days to keep (default: 90)
 */
router.delete('/cleanup', requireAdmin, cleanupOldNotifications);

// Advanced Admin Management Routes (Phase 4)

/**
 * @route GET /api/notifications/admin/summary
 * @desc Get notification summary for admin dashboard
 * @access Admin only
 */
router.get(
  '/admin/summary',
  requireAdmin,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('groupBy')
      .optional()
      .isIn(['notificationGroup', 'type', 'lifecycleStatus'])
      .withMessage('Invalid groupBy parameter'),
    query('sortBy')
      .optional()
      .isIn(['oldestCreated', 'newestCreated', 'count', 'readPercentage'])
      .withMessage('Invalid sortBy parameter'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    query('lifecycleStatus')
      .optional()
      .isIn(['active', 'pending_review', 'extended', 'archived'])
      .withMessage('Invalid lifecycle status'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for dateFrom'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for dateTo')
  ],
  getNotificationSummary
);

/**
 * @route GET /api/notifications/admin/pending-review
 * @desc Get notifications requiring admin review
 * @access Admin only
 */
router.get(
  '/admin/pending-review',
  requireAdmin,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'reminderSentAt', 'type'])
      .withMessage('Invalid sortBy parameter'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  getPendingReview
);

/**
 * @route DELETE /api/notifications/admin/bulk-delete
 * @desc Bulk delete notifications based on criteria
 * @access Admin only
 */
router.delete(
  '/admin/bulk-delete',
  requireAdmin,
  [
    body('confirmDeletion').isBoolean().withMessage('Confirmation is required'),
    body('notificationIds')
      .optional()
      .isArray()
      .withMessage('Notification IDs must be an array'),
    body('notificationIds.*')
      .optional()
      .isMongoId()
      .withMessage('Invalid notification ID format'),
    body('criteria')
      .optional()
      .isObject()
      .withMessage('Criteria must be an object'),
    body('criteria.lifecycleStatus')
      .optional()
      .isIn(['active', 'pending_review', 'extended', 'archived'])
      .withMessage('Invalid lifecycle status'),
    body('criteria.type')
      .optional()
      .isString()
      .withMessage('Type must be a string'),
    body('criteria.isReadByAllUsers')
      .optional()
      .isBoolean()
      .withMessage('isReadByAllUsers must be boolean'),
    body('criteria.olderThanDays')
      .optional()
      .isInt({ min: 1 })
      .withMessage('olderThanDays must be a positive integer'),
    body('criteria.notificationGroup')
      .optional()
      .isString()
      .withMessage('Notification group must be a string')
  ],
  bulkDeleteNotifications
);

/**
 * @route PUT /api/notifications/admin/:id/extend
 * @desc Extend notification lifecycle
 * @access Admin only
 */
router.put(
  '/admin/:id/extend',
  requireAdmin,
  [
    param('id').isMongoId().withMessage('Invalid notification ID'),
    body('extendDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Extend days must be between 1 and 365'),
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Reason must be a string with max 500 characters')
  ],
  extendNotificationLifecycle
);

/**
 * @route PUT /api/notifications/admin/settings
 * @desc Update notification settings
 * @access Admin only
 */
router.put(
  '/admin/settings',
  requireAdmin,
  [
    body('autoDeleteReadNotifications')
      .optional()
      .isBoolean()
      .withMessage('autoDeleteReadNotifications must be boolean'),
    body('maxRetentionDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Max retention days must be between 1 and 365'),
    body('reminderDaysBeforeExpiry')
      .optional()
      .isInt({ min: 1, max: 7 })
      .withMessage('Reminder days must be between 1 and 7'),
    body('importantNotificationTypes')
      .optional()
      .isArray()
      .withMessage('Important notification types must be an array'),
    body('importantNotificationTypes.*')
      .optional()
      .isString()
      .withMessage('Notification type must be a string'),
    body('autoExtendImportant')
      .optional()
      .isBoolean()
      .withMessage('autoExtendImportant must be boolean'),
    body('notificationBatchSize')
      .optional()
      .isInt({ min: 10, max: 1000 })
      .withMessage('Batch size must be between 10 and 1000')
  ],
  updateNotificationSettings
);

/**
 * @route GET /api/notifications/admin/settings
 * @desc Get current notification settings
 * @access Admin only
 */
router.get('/admin/settings', requireAdmin, getNotificationSettings);

/**
 * @route GET /api/notifications/admin/analytics
 * @desc Get notification analytics
 * @access Admin only
 */
router.get(
  '/admin/analytics',
  requireAdmin,
  [
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for dateFrom'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format for dateTo'),
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('GroupBy must be day, week, or month')
  ],
  getNotificationAnalytics
);

/**
 * @route POST /api/notifications/admin/run-lifecycle-job
 * @desc Manually run the lifecycle job
 * @access Admin only
 */
router.post('/admin/run-lifecycle-job', requireAdmin, runLifecycleJob);

/**
 * @route POST /api/notifications/admin/run-cleanup-job
 * @desc Manually run the cleanup job
 * @access Admin only
 */
router.post('/admin/run-cleanup-job', requireAdmin, runCleanupJob);

/**
 * @route GET /api/notifications/admin/cleanup-preview
 * @desc Get cleanup preview (dry run)
 * @access Admin only
 */
router.get('/admin/cleanup-preview', requireAdmin, getCleanupPreview);

/**
 * @route GET /api/notifications/admin/system-health
 * @desc Get comprehensive system health and monitoring report
 * @access Admin only
 */
router.get('/admin/system-health', requireAdmin, getSystemHealth);

/**
 * @route GET /api/notifications/admin/group-stats
 * @desc Get notification group breakdown statistics
 * @access Admin only
 */
router.get('/admin/group-stats', requireAdmin, getGroupStats);

module.exports = router;
