/**
 * Notification Auto-Cleanup & Optimization Job
 * Implements configurable auto-cleanup rules and archiving system
 */

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');

class NotificationCleanupJob {
  constructor() {
    this.name = 'NotificationCleanupJob';
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      notificationsArchived: 0,
      notificationsDeleted: 0,
      storageReclaimed: 0,
      averageProcessingTime: 0,
      errors: 0,
      lastCleanupRules: null
    };
  }

  /**
   * Get current cleanup configuration
   */
  getCleanupConfig() {
    const defaultConfig = {
      autoDeleteReadNotifications: false,
      maxRetentionDays: 90,
      reminderDaysBeforeExpiry: 1,
      importantNotificationTypes: [
        'payment_overdue',
        'security_alert',
        'system_maintenance'
      ],
      autoExtendImportant: true,
      notificationBatchSize: 100,
      archiveBeforeDelete: true,
      minAgeForArchiving: 60, // days
      minAgeForDeletion: 180, // days
      preserveImportantNotifications: true,
      maxArchiveSize: 10000, // max notifications to keep in archive
      cleanupSchedule: 'daily', // daily, weekly, monthly
      enableAutoCleanup: true
    };

    // Get settings from global config or use defaults
    return { ...defaultConfig, ...(global.notificationSettings || {}) };
  }

  /**
   * Execute the cleanup job with configurable rules
   */
  async execute() {
    if (this.isRunning) {
      console.log('⏳ Cleanup job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🧹 Starting notification auto-cleanup job...');

      const config = this.getCleanupConfig();

      if (!config.enableAutoCleanup) {
        console.log('⏸️ Auto-cleanup is disabled in configuration');
        this.updateStats(startTime, 0, 0, config);
        return;
      }

      console.log(
        '⚙️ Using cleanup configuration:',
        JSON.stringify(config, null, 2)
      );

      let totalArchived = 0;
      let totalDeleted = 0;

      // Step 1: Archive old notifications (if enabled)
      if (config.archiveBeforeDelete) {
        totalArchived = await this.archiveOldNotifications(config);
      }

      // Step 2: Delete very old notifications
      totalDeleted = await this.deleteVeryOldNotifications(config);

      // Step 3: Clean up read notifications (if auto-delete enabled)
      if (config.autoDeleteReadNotifications) {
        const readDeleted = await this.deleteReadNotifications(config);
        totalDeleted += readDeleted;
      }

      // Step 4: Manage archive size limits
      if (config.archiveBeforeDelete) {
        await this.manageArchiveSize(config);
      }

      // Step 5: Update statistics and performance metrics
      this.updateStats(startTime, totalArchived, totalDeleted, config);

      console.log(
        `✅ Cleanup job completed: ${totalArchived} archived, ${totalDeleted} deleted`
      );

      // Step 6: Generate cleanup report for admin
      await this.generateCleanupReport(totalArchived, totalDeleted, config);
    } catch (error) {
      this.stats.errors++;
      console.error('❌ Error in notification cleanup job:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Archive old notifications based on configuration
   */
  async archiveOldNotifications(config) {
    const archiveCutoffDate = new Date();
    archiveCutoffDate.setDate(
      archiveCutoffDate.getDate() - config.minAgeForArchiving
    );

    // Find notifications eligible for archiving
    const archiveFilter = {
      createdAt: { $lt: archiveCutoffDate },
      lifecycleStatus: { $in: ['active', 'pending_review'] },
      adminManaged: true
    };

    // Don't archive important notifications if preservation is enabled
    if (config.preserveImportantNotifications) {
      archiveFilter.type = { $nin: config.importantNotificationTypes };
    }

    const notificationsToArchive = await Notification.find(archiveFilter)
      .limit(config.notificationBatchSize)
      .sort({ createdAt: 1 }); // Oldest first

    if (notificationsToArchive.length === 0) {
      console.log('📁 No notifications eligible for archiving');
      return 0;
    }

    console.log(
      `📁 Archiving ${notificationsToArchive.length} old notifications...`
    );

    // Update notifications to archived status
    const archiveIds = notificationsToArchive.map(n => n._id);
    const archiveResult = await Notification.updateMany(
      { _id: { $in: archiveIds } },
      {
        $set: {
          lifecycleStatus: 'archived',
          archivedAt: new Date(),
          archivedReason: 'auto_cleanup_age_based'
        }
      }
    );

    console.log(`✅ Archived ${archiveResult.modifiedCount} notifications`);
    return archiveResult.modifiedCount;
  }

  /**
   * Delete very old notifications
   */
  async deleteVeryOldNotifications(config) {
    const deleteCutoffDate = new Date();
    deleteCutoffDate.setDate(
      deleteCutoffDate.getDate() - config.minAgeForDeletion
    );

    // Find notifications eligible for deletion
    const deleteFilter = {
      createdAt: { $lt: deleteCutoffDate },
      lifecycleStatus: 'archived' // Only delete already archived notifications
    };

    // Don't delete important notifications if preservation is enabled
    if (config.preserveImportantNotifications) {
      deleteFilter.type = { $nin: config.importantNotificationTypes };
    }

    const notificationsToDelete = await Notification.find(deleteFilter)
      .limit(config.notificationBatchSize)
      .sort({ createdAt: 1 });

    if (notificationsToDelete.length === 0) {
      console.log('🗑️ No notifications eligible for deletion');
      return 0;
    }

    console.log(
      `🗑️ Deleting ${notificationsToDelete.length} very old notifications...`
    );

    // Log what we're deleting for audit trail
    const deletionSummary = notificationsToDelete.reduce(
      (summary, notification) => {
        const type = notification.type;
        summary[type] = (summary[type] || 0) + 1;
        return summary;
      },
      {}
    );

    console.log('🗑️ Deletion summary by type:', deletionSummary);

    const deleteIds = notificationsToDelete.map(n => n._id);
    const deleteResult = await Notification.deleteMany({
      _id: { $in: deleteIds }
    });

    console.log(`✅ Deleted ${deleteResult.deletedCount} old notifications`);
    return deleteResult.deletedCount;
  }

  /**
   * Delete read notifications if auto-delete is enabled
   */
  async deleteReadNotifications(config) {
    const readCutoffDate = new Date();
    readCutoffDate.setDate(readCutoffDate.getDate() - config.maxRetentionDays);

    const deleteFilter = {
      createdAt: { $lt: readCutoffDate },
      isReadByAllUsers: true,
      lifecycleStatus: 'active'
    };

    // Don't delete important notifications if preservation is enabled
    if (config.preserveImportantNotifications) {
      deleteFilter.type = { $nin: config.importantNotificationTypes };
    }

    const readNotificationsToDelete = await Notification.find(
      deleteFilter
    ).limit(config.notificationBatchSize);

    if (readNotificationsToDelete.length === 0) {
      console.log('📚 No read notifications eligible for auto-deletion');
      return 0;
    }

    console.log(
      `📚 Auto-deleting ${readNotificationsToDelete.length} read notifications...`
    );

    const deleteIds = readNotificationsToDelete.map(n => n._id);
    const deleteResult = await Notification.deleteMany({
      _id: { $in: deleteIds }
    });

    console.log(
      `✅ Auto-deleted ${deleteResult.deletedCount} read notifications`
    );
    return deleteResult.deletedCount;
  }

  /**
   * Manage archive size to prevent unlimited growth
   */
  async manageArchiveSize(config) {
    const archivedCount = await Notification.countDocuments({
      lifecycleStatus: 'archived'
    });

    if (archivedCount <= config.maxArchiveSize) {
      console.log(
        `📁 Archive size OK: ${archivedCount}/${config.maxArchiveSize} notifications`
      );
      return;
    }

    console.log(
      `📁 Archive size exceeded: ${archivedCount}/${config.maxArchiveSize}, cleaning oldest...`
    );

    // Find oldest archived notifications to delete
    const excessCount = archivedCount - config.maxArchiveSize;
    const oldestArchived = await Notification.find({
      lifecycleStatus: 'archived'
    })
      .sort({ archivedAt: 1 })
      .limit(excessCount);

    if (oldestArchived.length > 0) {
      const deleteIds = oldestArchived.map(n => n._id);
      const deleteResult = await Notification.deleteMany({
        _id: { $in: deleteIds }
      });

      console.log(
        `🗑️ Removed ${deleteResult.deletedCount} oldest archived notifications to maintain size limit`
      );
    }
  }

  /**
   * Generate cleanup report for admin
   */
  async generateCleanupReport(archived, deleted, config) {
    try {
      // Get current storage statistics
      const storageStats = await this.getStorageStatistics();

      // Find admin users to notify
      const adminUsers = await User.find({
        role: { $in: ['admin', 'super_admin'] },
        isActive: true
      });

      if (adminUsers.length === 0) {
        console.log('⚠️ No admin users found to send cleanup report');
        return;
      }

      // Create cleanup report notification
      if (archived > 0 || deleted > 0) {
        const reportData = {
          type: 'system_maintenance',
          title: 'Notification Cleanup Report',
          message: `Auto-cleanup completed: ${archived} notifications archived, ${deleted} deleted. Current storage: ${storageStats.totalNotifications} notifications using ~${storageStats.estimatedSizeMB}MB.`,
          priority: 'normal',
          actionUrl: '/admin/notifications/analytics',
          actionText: 'View Analytics',
          actorId: null,
          notificationGroup: `cleanup_report_${new Date().toISOString().split('T')[0].replace(/-/g, '_')}`,
          recipientUserIds: adminUsers.map(admin => admin._id),
          adminManaged: true,
          metadata: {
            cleanupStats: {
              archived,
              deleted,
              totalProcessed: archived + deleted,
              storageStats,
              config: config,
              executedAt: new Date()
            }
          }
        };

        // Create individual notifications for each admin
        const adminNotifications = adminUsers.map(admin => ({
          ...reportData,
          userId: admin._id
        }));

        await Notification.insertMany(adminNotifications);

        console.log(
          `📊 Sent cleanup report to ${adminUsers.length} admin users`
        );
      }
    } catch (error) {
      console.error('❌ Error generating cleanup report:', error);
    }
  }

  /**
   * Get storage and performance statistics
   */
  async getStorageStatistics() {
    const stats = await Notification.aggregate([
      {
        $addFields: {
          docAsString: {
            $convert: {
              input: '$_id',
              to: 'string',
              onError: 'invalid'
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalNotifications: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'active'] }, 1, 0] }
          },
          archivedCount: {
            $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'archived'] }, 1, 0] }
          },
          readCount: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
          avgSize: { $avg: { $strLenCP: '$docAsString' } },
          oldestNotification: { $min: '$createdAt' },
          newestNotification: { $max: '$createdAt' }
        }
      }
    ]);

    const result = stats[0] || {
      totalNotifications: 0,
      activeCount: 0,
      archivedCount: 0,
      readCount: 0,
      avgSize: 0,
      oldestNotification: null,
      newestNotification: null
    };

    // Estimate storage size (rough calculation)
    result.estimatedSizeMB =
      Math.round(
        ((result.totalNotifications * result.avgSize) / (1024 * 1024)) * 100
      ) / 100;
    result.readPercentage =
      result.totalNotifications > 0
        ? Math.round((result.readCount / result.totalNotifications) * 100)
        : 0;

    return result;
  }

  /**
   * Update job statistics
   */
  updateStats(startTime, archived, deleted, config) {
    const processingTime = Date.now() - startTime;
    this.stats.totalRuns++;
    this.stats.notificationsArchived += archived;
    this.stats.notificationsDeleted += deleted;
    this.stats.averageProcessingTime =
      (this.stats.averageProcessingTime * (this.stats.totalRuns - 1) +
        processingTime) /
      this.stats.totalRuns;
    this.stats.lastCleanupRules = {
      archiveEnabled: config.archiveBeforeDelete,
      autoDeleteRead: config.autoDeleteReadNotifications,
      maxRetentionDays: config.maxRetentionDays,
      batchSize: config.notificationBatchSize
    };
    this.lastRun = new Date();
  }

  /**
   * Schedule the cleanup job
   */
  start(intervalHours = 24) {
    const config = this.getCleanupConfig();

    if (!config.enableAutoCleanup) {
      console.log('⏸️ Auto-cleanup is disabled, not scheduling cleanup job');
      return this;
    }

    console.log(
      `🗓️ Scheduling notification cleanup job every ${intervalHours} hours`
    );

    // Run after startup delay
    setTimeout(() => {
      this.execute().catch(console.error);
    }, 10000); // 10 seconds delay

    // Then run periodically
    this.interval = setInterval(
      () => {
        this.execute().catch(console.error);
      },
      intervalHours * 60 * 60 * 1000
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
      console.log('⏹️ Notification cleanup job stopped');
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
      nextRun: this.getNextRunTime(),
      config: this.getCleanupConfig()
    };
  }

  /**
   * Get next scheduled run time
   */
  getNextRunTime() {
    if (!this.interval) return null;

    const now = new Date();
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    return next;
  }

  /**
   * Force run the job manually
   */
  async runNow() {
    console.log('🔧 Manually triggering notification cleanup job...');
    return await this.execute();
  }

  /**
   * Dry run - show what would be cleaned up without actually doing it
   */
  async dryRun() {
    console.log('🔍 Running cleanup dry run (no changes will be made)...');

    const config = this.getCleanupConfig();

    // Calculate what would be archived
    const archiveCutoffDate = new Date();
    archiveCutoffDate.setDate(
      archiveCutoffDate.getDate() - config.minAgeForArchiving
    );

    const wouldArchive = await Notification.countDocuments({
      createdAt: { $lt: archiveCutoffDate },
      lifecycleStatus: { $in: ['active', 'pending_review'] },
      adminManaged: true,
      ...(config.preserveImportantNotifications && {
        type: { $nin: config.importantNotificationTypes }
      })
    });

    // Calculate what would be deleted
    const deleteCutoffDate = new Date();
    deleteCutoffDate.setDate(
      deleteCutoffDate.getDate() - config.minAgeForDeletion
    );

    const wouldDelete = await Notification.countDocuments({
      createdAt: { $lt: deleteCutoffDate },
      lifecycleStatus: 'archived',
      ...(config.preserveImportantNotifications && {
        type: { $nin: config.importantNotificationTypes }
      })
    });

    // Calculate auto-delete for read notifications
    let wouldAutoDelete = 0;
    if (config.autoDeleteReadNotifications) {
      const readCutoffDate = new Date();
      readCutoffDate.setDate(
        readCutoffDate.getDate() - config.maxRetentionDays
      );

      wouldAutoDelete = await Notification.countDocuments({
        createdAt: { $lt: readCutoffDate },
        isReadByAllUsers: true,
        lifecycleStatus: 'active',
        ...(config.preserveImportantNotifications && {
          type: { $nin: config.importantNotificationTypes }
        })
      });
    }

    const dryRunResult = {
      wouldArchive,
      wouldDelete,
      wouldAutoDelete,
      totalImpact: wouldArchive + wouldDelete + wouldAutoDelete,
      config,
      generatedAt: new Date()
    };

    console.log('🔍 Dry run results:', dryRunResult);
    return dryRunResult;
  }
}

// Export singleton instance
const notificationCleanupJob = new NotificationCleanupJob();
module.exports = notificationCleanupJob;
