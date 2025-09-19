/**
 * Notification Read Status Update Job
 * Updates isReadByAllUsers flag based on actual read status
 */

const Notification = require('../models/Notification.model');
const notificationCleanupJob = require('./notificationCleanup.job');

class NotificationReadStatusJob {
  constructor() {
    this.name = 'NotificationReadStatusJob';
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      totalUpdated: 0,
      lastUpdatedCount: 0,
      averageProcessingTime: 0,
      errors: 0
    };
  }

  /**
   * Execute the read status update job
   */
  async execute() {
    if (this.isRunning) {
      console.log('⏳ Read status job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Starting notification read status update job...');

      // Find notifications that need read status update
      const inconsistentNotifications =
        await Notification.getNotificationsNeedingReadUpdate();
      const notificationIds = inconsistentNotifications.map(n => n._id);

      if (notificationIds.length === 0) {
        console.log('✅ All notification read statuses are consistent');
        this.lastRun = new Date();
        this.stats.totalRuns++;
        this.stats.lastUpdatedCount = 0;
        return;
      }

      console.log(
        `📊 Found ${notificationIds.length} notifications with inconsistent read status`
      );

      // Update read status for inconsistent notifications
      const updatedCount = await Notification.updateReadStatus(notificationIds);

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.stats.totalRuns++;
      this.stats.totalUpdated += updatedCount;
      this.stats.lastUpdatedCount = updatedCount;
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime * (this.stats.totalRuns - 1) +
          processingTime) /
        this.stats.totalRuns;

      this.lastRun = new Date();

      console.log(
        `✅ Read status job completed: ${updatedCount} notifications updated in ${processingTime}ms`
      );

      // Log additional info if significant updates
      if (updatedCount > 10) {
        console.log(
          `📈 Large batch update: ${updatedCount} notifications corrected`
        );
      }

      // Trigger auto-cleanup if configured (Phase 5)
      await this.triggerAutoCleanupIfConfigured();
    } catch (error) {
      this.stats.errors++;
      console.error('❌ Error in notification read status job:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Schedule the job to run periodically
   */
  start(intervalMinutes = 60) {
    console.log(
      `📅 Scheduling notification read status job every ${intervalMinutes} minutes`
    );

    // Run immediately on start
    setTimeout(() => {
      this.execute().catch(console.error);
    }, 30000); // Wait 30 seconds after startup

    // Then run periodically
    this.interval = setInterval(
      () => {
        this.execute().catch(console.error);
      },
      intervalMinutes * 60 * 1000
    );

    return this;
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('⏹️ Notification read status job stopped');
    }
  }

  /**
   * Get job statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      uptime: this.lastRun ? Date.now() - this.lastRun.getTime() : null
    };
  }

  /**
   * Force run the job manually
   */
  async runNow() {
    console.log('🔧 Manually triggering notification read status job...');
    return await this.execute();
  }

  /**
   * Cleanup old read status data (optional maintenance)
   */
  async cleanupOldReadData(daysOld = 90) {
    try {
      console.log(`🧹 Cleaning up read data older than ${daysOld} days...`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Remove old readByUsers entries
      const result = await Notification.updateMany(
        {
          'readByUsers.readAt': { $lt: cutoffDate },
          expiresAt: { $lt: new Date() } // Only clean expired notifications
        },
        {
          $pull: {
            readByUsers: {
              readAt: { $lt: cutoffDate }
            }
          }
        }
      );

      console.log(
        `🧹 Cleaned up read data from ${result.modifiedCount} expired notifications`
      );
      return result.modifiedCount;
    } catch (error) {
      console.error('❌ Error cleaning up old read data:', error);
      throw error;
    }
  }

  /**
   * Trigger auto-cleanup if configured (Phase 5)
   */
  async triggerAutoCleanupIfConfigured() {
    try {
      const config = global.notificationSettings || {};

      // Only trigger cleanup if auto-delete is enabled and it's been long enough since last cleanup
      if (config.autoDeleteReadNotifications && config.enableAutoCleanup) {
        const cleanupStats = notificationCleanupJob.getStats();
        const hoursSinceLastCleanup = cleanupStats.lastRun
          ? (Date.now() - new Date(cleanupStats.lastRun).getTime()) /
            (1000 * 60 * 60)
          : Infinity;

        // Only run cleanup every 6 hours maximum (to avoid too frequent cleanup)
        if (hoursSinceLastCleanup >= 6) {
          console.log('🧹 Triggering auto-cleanup after read status update...');

          // Run cleanup in background (don't await to avoid blocking read status job)
          notificationCleanupJob.execute().catch(error => {
            console.error('❌ Auto-cleanup failed:', error);
          });
        }
      }
    } catch (error) {
      console.error('❌ Error checking auto-cleanup configuration:', error);
    }
  }

  /**
   * Get detailed report of read status inconsistencies
   */
  async getInconsistencyReport() {
    try {
      const inconsistentNotifications = await Notification.aggregate([
        {
          $match: {
            recipientUserIds: { $exists: true, $type: 'array', $ne: [] }
          }
        },
        {
          $addFields: {
            actualReadStatus: {
              $allElementsTrue: {
                $map: {
                  input: '$recipientUserIds',
                  as: 'recipientId',
                  in: {
                    $in: ['$$recipientId', '$readByUsers.userId']
                  }
                }
              }
            }
          }
        },
        {
          $match: {
            $expr: {
              $ne: ['$isReadByAllUsers', '$actualReadStatus']
            }
          }
        },
        {
          $group: {
            _id: '$notificationGroup',
            count: { $sum: 1 },
            types: { $addToSet: '$type' },
            oldestCreated: { $min: '$createdAt' },
            newestCreated: { $max: '$createdAt' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      return {
        totalInconsistent: inconsistentNotifications.reduce(
          (sum, group) => sum + group.count,
          0
        ),
        groupBreakdown: inconsistentNotifications,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Error generating inconsistency report:', error);
      throw error;
    }
  }
}

// Export singleton instance
const notificationReadStatusJob = new NotificationReadStatusJob();
module.exports = notificationReadStatusJob;
