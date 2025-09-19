/**
 * Admin Jobs Controller
 * Handles job management and monitoring for administrators
 */

const jobScheduler = require('../../jobs/jobScheduler');
const ApiResponse = require('../../utils/response');
const { asyncHandler } = require('../../middleware/errorHandler.middleware');

/**
 * Get status of all background jobs
 * GET /api/admin/jobs/status
 */
const getJobsStatus = asyncHandler(async (req, res) => {
  const status = jobScheduler.getStatus();

  ApiResponse.success(res, status, 'Jobs status retrieved successfully');
});

/**
 * Get health check for all jobs
 * GET /api/admin/jobs/health
 */
const getJobsHealth = asyncHandler(async (req, res) => {
  const healthCheck = await jobScheduler.healthCheck();

  ApiResponse.success(res, healthCheck, 'Jobs health check completed');
});

/**
 * Run a specific job manually
 * POST /api/admin/jobs/:jobName/run
 */
const runJob = asyncHandler(async (req, res) => {
  const { jobName } = req.params;

  try {
    const result = await jobScheduler.runJob(jobName);

    ApiResponse.success(
      res,
      { jobName, result },
      `Job '${jobName}' executed successfully`
    );
  } catch (error) {
    return ApiResponse.error(res, error.message, 400);
  }
});

/**
 * Restart a specific job
 * POST /api/admin/jobs/:jobName/restart
 */
const restartJob = asyncHandler(async (req, res) => {
  const { jobName } = req.params;

  try {
    await jobScheduler.restartJob(jobName);

    ApiResponse.success(
      res,
      { jobName },
      `Job '${jobName}' restarted successfully`
    );
  } catch (error) {
    return ApiResponse.error(res, error.message, 400);
  }
});

/**
 * Get list of available jobs
 * GET /api/admin/jobs
 */
const getAvailableJobs = asyncHandler(async (req, res) => {
  const jobs = jobScheduler.getAvailableJobs();

  ApiResponse.success(res, { jobs }, 'Available jobs retrieved successfully');
});

/**
 * Get detailed notification read status report
 * GET /api/admin/jobs/notification-read-status/report
 */
const getNotificationReadStatusReport = asyncHandler(async (req, res) => {
  const job = jobScheduler.jobs.get('notificationReadStatus');

  if (!job) {
    return ApiResponse.error(
      res,
      'Notification read status job not found',
      404
    );
  }

  try {
    const report = await job.getInconsistencyReport();

    ApiResponse.success(
      res,
      report,
      'Notification read status report generated successfully'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message, 500);
  }
});

/**
 * Cleanup old notification read data
 * DELETE /api/admin/jobs/notification-read-status/cleanup
 */
const cleanupNotificationReadData = asyncHandler(async (req, res) => {
  const { daysOld = 90 } = req.query;
  const job = jobScheduler.jobs.get('notificationReadStatus');

  if (!job) {
    return ApiResponse.error(
      res,
      'Notification read status job not found',
      404
    );
  }

  try {
    const cleanedCount = await job.cleanupOldReadData(parseInt(daysOld));

    ApiResponse.success(
      res,
      { cleanedCount, daysOld: parseInt(daysOld) },
      `Cleaned up read data from ${cleanedCount} notifications`
    );
  } catch (error) {
    return ApiResponse.error(res, error.message, 500);
  }
});

module.exports = {
  getJobsStatus,
  getJobsHealth,
  runJob,
  restartJob,
  getAvailableJobs,
  getNotificationReadStatusReport,
  cleanupNotificationReadData
};
