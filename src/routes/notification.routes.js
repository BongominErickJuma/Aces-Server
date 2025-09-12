/**
 * Notification Routes
 * Handles notification-related endpoints
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

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

module.exports = router;
