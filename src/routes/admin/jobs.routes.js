/**
 * Admin Jobs Routes
 * Routes for managing background jobs (admin only)
 */

const express = require('express');
const {
  getJobsStatus,
  getJobsHealth,
  runJob,
  restartJob,
  getAvailableJobs,
  getNotificationReadStatusReport,
  cleanupNotificationReadData
} = require('../../controllers/admin/jobs.controller');

const {
  authenticate,
  requireRole
} = require('../../middleware/auth.middleware');

const router = express.Router();

// Apply authentication and admin role requirement to all routes
router.use(authenticate);
router.use(requireRole(['admin']));

// Jobs management routes
router.get('/', getAvailableJobs);
router.get('/status', getJobsStatus);
router.get('/health', getJobsHealth);

// Individual job operations
router.post('/:jobName/run', runJob);
router.post('/:jobName/restart', restartJob);

// Notification read status job specific routes
router.get('/notification-read-status/report', getNotificationReadStatusReport);
router.delete('/notification-read-status/cleanup', cleanupNotificationReadData);

module.exports = router;
