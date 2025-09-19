/**
 * Job Scheduler
 * Manages all background jobs and their scheduling
 */

const notificationReadStatusJob = require('./notificationReadStatus.job');
const notificationLifecycleJob = require('./notificationLifecycle.job');
const notificationCleanupJob = require('./notificationCleanup.job');
const notificationService = require('../services/notification.service');

class JobScheduler {
  constructor() {
    this.jobs = new Map();
    this.isStarted = false;
  }

  /**
   * Register all jobs
   */
  registerJobs() {
    // Register notification read status job
    this.jobs.set('notificationReadStatus', notificationReadStatusJob);

    // Register notification lifecycle job
    this.jobs.set('notificationLifecycle', notificationLifecycleJob);

    // Register notification cleanup job (Phase 5)
    this.jobs.set('notificationCleanup', notificationCleanupJob);

    console.log(`📋 Registered ${this.jobs.size} background jobs`);
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isStarted) {
      console.log('⚠️ Job scheduler already started');
      return;
    }

    console.log('🚀 Starting job scheduler...');

    // Register jobs
    this.registerJobs();

    // Start notification read status job (runs every hour)
    notificationReadStatusJob.start(60);

    // Start notification lifecycle job (runs daily at 2 AM)
    notificationLifecycleJob.start();

    // Start notification cleanup job (runs daily, configurable)
    notificationCleanupJob.start(24); // 24 hours interval

    // Start notification service periodic checks (runs every 10 minutes)
    // TEMPORARILY DISABLED - Causing notifications on every page refresh
    // if (!notificationService.isMonitoring) {
    //   notificationService.startMonitoring();
    // }

    this.isStarted = true;
    console.log('✅ Job scheduler started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  async stop() {
    if (!this.isStarted) {
      console.log('⚠️ Job scheduler not started');
      return;
    }

    console.log('⏹️ Stopping job scheduler...');

    // Stop all jobs
    for (const [name, job] of this.jobs) {
      try {
        if (job.stop) {
          await job.stop();
          console.log(`⏹️ Stopped job: ${name}`);
        }
      } catch (error) {
        console.error(`❌ Error stopping job ${name}:`, error);
      }
    }

    // Stop notification service
    if (notificationService.isMonitoring) {
      await notificationService.stopMonitoring();
    }

    this.isStarted = false;
    console.log('⏹️ Job scheduler stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = {
      isStarted: this.isStarted,
      jobs: {},
      timestamp: new Date()
    };

    for (const [name, job] of this.jobs) {
      try {
        status.jobs[name] = job.getStats
          ? job.getStats()
          : { status: 'unknown' };
      } catch (error) {
        status.jobs[name] = { status: 'error', error: error.message };
      }
    }

    return status;
  }

  /**
   * Run a specific job manually
   */
  async runJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job '${jobName}' not found`);
    }

    if (!job.runNow && !job.execute) {
      throw new Error(`Job '${jobName}' does not support manual execution`);
    }

    console.log(`🔧 Manually running job: ${jobName}`);

    if (job.runNow) {
      return await job.runNow();
    } else {
      return await job.execute();
    }
  }

  /**
   * Get list of available jobs
   */
  getAvailableJobs() {
    return Array.from(this.jobs.keys());
  }

  /**
   * Restart a specific job
   */
  async restartJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job '${jobName}' not found`);
    }

    console.log(`🔄 Restarting job: ${jobName}`);

    // Stop the job if it has a stop method
    if (job.stop) {
      await job.stop();
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start the job again if it has a start method
    if (job.start) {
      job.start();
    }

    console.log(`✅ Job restarted: ${jobName}`);
  }

  /**
   * Schedule a one-time job
   */
  scheduleOneTime(jobFunction, delayMs, jobName = 'oneTime') {
    console.log(
      `⏰ Scheduling one-time job '${jobName}' to run in ${delayMs}ms`
    );

    const timeoutId = setTimeout(async () => {
      try {
        console.log(`▶️ Running one-time job: ${jobName}`);
        await jobFunction();
        console.log(`✅ One-time job completed: ${jobName}`);
      } catch (error) {
        console.error(`❌ One-time job failed: ${jobName}`, error);
      }
    }, delayMs);

    return {
      cancel: () => {
        clearTimeout(timeoutId);
        console.log(`❌ Cancelled one-time job: ${jobName}`);
      }
    };
  }

  /**
   * Health check for all jobs
   */
  async healthCheck() {
    const results = {
      overall: 'healthy',
      jobs: {},
      timestamp: new Date()
    };

    let hasErrors = false;

    for (const [name, job] of this.jobs) {
      try {
        const stats = job.getStats ? job.getStats() : {};

        // Determine health based on various factors
        let health = 'healthy';
        const issues = [];

        // Check if job is running when it should be
        if (job.isRunning === false && this.isStarted) {
          // This might be normal between runs
        }

        // Check error rate
        if (stats.errors > 0 && stats.totalRuns > 0) {
          const errorRate = stats.errors / stats.totalRuns;
          if (errorRate > 0.1) {
            // More than 10% error rate
            health = 'unhealthy';
            issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
          }
        }

        // Check last run time
        if (stats.lastRun) {
          const timeSinceLastRun =
            Date.now() - new Date(stats.lastRun).getTime();
          const hoursSinceLastRun = timeSinceLastRun / (1000 * 60 * 60);

          if (hoursSinceLastRun > 2) {
            // Haven't run in 2+ hours
            health = 'warning';
            issues.push(
              `Last run was ${hoursSinceLastRun.toFixed(1)} hours ago`
            );
          }
        }

        results.jobs[name] = {
          health,
          issues,
          stats
        };

        if (health === 'unhealthy') {
          hasErrors = true;
        }
      } catch (error) {
        results.jobs[name] = {
          health: 'unhealthy',
          issues: [`Health check failed: ${error.message}`]
        };
        hasErrors = true;
      }
    }

    results.overall = hasErrors ? 'unhealthy' : 'healthy';
    return results;
  }
}

// Export singleton instance
const jobScheduler = new JobScheduler();
module.exports = jobScheduler;
