/**
 * Dashboard Routes
 * Handles dashboard and reporting endpoints
 */

const express = require('express');
const router = express.Router();

const {
  getDashboardStats,
  getRecentDocuments,
  getUserPerformanceReport,
  getDocumentStatsReport
} = require('../controllers/dashboard.controller');

const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route GET /api/dashboard/stats
 * @desc Get dashboard statistics with overview metrics
 * @access Private
 * @query period (7d, 30d, 90d, 1y) - Default: 30d
 */
router.get('/stats', getDashboardStats);

/**
 * @route GET /api/dashboard/recent
 * @desc Get recent documents (quotations and receipts)
 * @access Private
 * @query limit - Number of documents to return (default: 10)
 * @query type - Document type: 'quotations', 'receipts', or 'all' (default: 'all')
 * @query status - Filter by status (default: 'all')
 */
router.get('/recent', getRecentDocuments);

/**
 * @route GET /api/reports/user-performance
 * @desc Get user performance report showing document creation and conversion rates
 * @access Admin only
 * @query period (7d, 30d, 90d, 1y) - Default: 30d
 * @query userId - Filter by specific user ID (optional)
 */
router.get('/reports/user-performance', requireAdmin, getUserPerformanceReport);

/**
 * @route GET /api/reports/document-stats
 * @desc Get document statistics and trends over time
 * @access Private
 * @query period (7d, 30d, 90d, 1y) - Default: 30d
 * @query granularity (daily, weekly, monthly) - Default: daily
 */
router.get('/reports/document-stats', getDocumentStatsReport);

module.exports = router;
