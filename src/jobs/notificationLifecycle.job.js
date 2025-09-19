/**
 * Notification Lifecycle Management Job
 * Handles 30-day lifecycle management for notifications
 * - Checks for notifications approaching 30 days
 * - Sends reminders to admin
 * - Updates lifecycle status to pending_review
 */

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');

class NotificationLifecycleJob {
  constructor() {
    this.name = 'NotificationLifecycleJob';
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      notificationsChecked: 0,
      remindersSent: 0,
      statusUpdates: 0,
      errors: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Execute the lifecycle management job
   */
  async execute() {
    if (this.isRunning) {
      console.log('⏳ Lifecycle job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔄 Starting notification lifecycle management job...');

      // Find notifications that are 30 days old and need admin review
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const notificationsNeedingReview = await Notification.find({
        createdAt: { $lte: thirtyDaysAgo },
        lifecycleStatus: 'active',
        adminManaged: true,
        reminderSentAt: { $exists: false } // Haven't sent reminder yet
      }).sort({ createdAt: 1 });

      console.log(
        `📊 Found ${notificationsNeedingReview.length} notifications requiring lifecycle review`
      );

      if (notificationsNeedingReview.length === 0) {
        console.log(
          '✅ No notifications require lifecycle review at this time'
        );
        this.updateStats(startTime, 0, 0, 0);
        return;
      }

      let remindersSent = 0;
      let statusUpdates = 0;

      // Process notifications in batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < notificationsNeedingReview.length; i += batchSize) {
        const batch = notificationsNeedingReview.slice(i, i + batchSize);

        for (const notification of batch) {
          try {
            // Update notification status to pending_review
            notification.lifecycleStatus = 'pending_review';
            notification.reminderSentAt = new Date();
            await notification.save();
            statusUpdates++;

            console.log(
              `📋 Updated notification ${notification._id} to pending_review (created ${notification.createdAt.toDateString()})`
            );

            // Send reminder notification to admin users
            await this.sendAdminReminder(notification);
            remindersSent++;
          } catch (error) {
            console.error(
              `❌ Error processing notification ${notification._id}:`,
              error
            );
            this.stats.errors++;
          }
        }

        // Small delay between batches to avoid overwhelming the database
        if (i + batchSize < notificationsNeedingReview.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update statistics
      this.updateStats(
        startTime,
        notificationsNeedingReview.length,
        remindersSent,
        statusUpdates
      );

      console.log(
        `✅ Lifecycle job completed: ${statusUpdates} status updates, ${remindersSent} admin reminders sent`
      );

      // Also check for notifications that need auto-extension
      await this.checkAutoExtensions();
    } catch (error) {
      this.stats.errors++;
      console.error('❌ Error in notification lifecycle job:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Send reminder notification to admin users
   */
  async sendAdminReminder(originalNotification) {
    try {
      // Find admin users
      const adminUsers = await User.find({
        role: { $in: ['admin', 'super_admin'] },
        isActive: true
      });

      if (adminUsers.length === 0) {
        console.warn(
          '⚠️ No active admin users found to send lifecycle reminders'
        );
        return;
      }

      const adminUserIds = adminUsers.map(admin => admin._id);

      // Create reminder notification for admins
      const reminderData = {
        type: 'system_maintenance',
        title: 'Notification Lifecycle Review Required',
        message: `Notification "${originalNotification.title}" (created ${originalNotification.createdAt.toDateString()}) requires admin review after 30 days.`,
        priority: 'high',
        actionUrl: '/admin/notifications/pending-review',
        actionText: 'Review Notifications',
        actorId: null, // System-generated
        notificationGroup: `lifecycle_reminder_${new Date().toISOString().split('T')[0].replace(/-/g, '_')}`,
        recipientUserIds: adminUserIds,
        adminManaged: true,
        metadata: {
          originalNotificationId: originalNotification._id,
          originalNotificationGroup: originalNotification.notificationGroup,
          reviewReason: '30_day_lifecycle_check',
          originalCreatedAt: originalNotification.createdAt
        }
      };

      // Create individual notifications for each admin
      const adminNotifications = adminUserIds.map(adminId => ({
        ...reminderData,
        userId: adminId
      }));

      await Notification.insertMany(adminNotifications);

      console.log(
        `📨 Sent lifecycle reminder to ${adminUsers.length} admin users for notification ${originalNotification._id}`
      );
    } catch (error) {
      console.error(
        `❌ Error sending admin reminder for notification ${originalNotification._id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check for notifications that should be auto-extended
   */
  async checkAutoExtensions() {
    try {
      // Find important notification types that should be auto-extended
      const importantTypes = [
        'payment_overdue',
        'security_alert',
        'system_maintenance'
      ];

      const notificationsToExtend = await Notification.find({
        lifecycleStatus: 'pending_review',
        type: { $in: importantTypes },
        extendedUntil: { $exists: false } // Haven't been extended yet
      });

      if (notificationsToExtend.length === 0) {
        return;
      }

      console.log(
        `🔄 Auto-extending ${notificationsToExtend.length} important notifications`
      );

      for (const notification of notificationsToExtend) {
        // Extend by 30 more days
        const extendUntil = new Date();
        extendUntil.setDate(extendUntil.getDate() + 30);

        notification.lifecycleStatus = 'extended';
        notification.extendedUntil = extendUntil;
        notification.expiresAt = extendUntil;

        await notification.save();

        console.log(
          `📅 Auto-extended notification ${notification._id} until ${extendUntil.toDateString()}`
        );
      }
    } catch (error) {
      console.error('❌ Error in auto-extension check:', error);
    }
  }

  /**
   * Update job statistics
   */
  updateStats(startTime, checked, remindersSent, statusUpdates) {
    const processingTime = Date.now() - startTime;
    this.stats.totalRuns++;
    this.stats.notificationsChecked += checked;
    this.stats.remindersSent += remindersSent;
    this.stats.statusUpdates += statusUpdates;
    this.stats.averageProcessingTime =
      (this.stats.averageProcessingTime * (this.stats.totalRuns - 1) +
        processingTime) /
      this.stats.totalRuns;
    this.lastRun = new Date();
  }

  /**
   * Schedule the job to run daily at 2 AM
   */
  start() {
    console.log(
      '📅 Scheduling notification lifecycle job to run daily at 2 AM'
    );

    // Calculate time until next 2 AM
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);

    // If it's already past 2 AM today, schedule for tomorrow
    if (now > next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    const msUntilNext2AM = next2AM.getTime() - now.getTime();

    // Run immediately if in development mode (for testing)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Running lifecycle job immediately');
      setTimeout(() => {
        this.execute().catch(console.error);
      }, 5000); // Run after 5 seconds in dev mode
    } else {
      // Schedule first run at 2 AM
      setTimeout(() => {
        this.execute().catch(console.error);
      }, msUntilNext2AM);
    }

    // Then run every 24 hours
    this.interval = setInterval(
      () => {
        this.execute().catch(console.error);
      },
      24 * 60 * 60 * 1000
    ); // 24 hours

    console.log(
      `⏰ Next lifecycle check scheduled for: ${next2AM.toLocaleString()}`
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
      console.log('⏹️ Notification lifecycle job stopped');
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
      nextRun: this.getNextRunTime()
    };
  }

  /**
   * Get next scheduled run time
   */
  getNextRunTime() {
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);

    if (now > next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    return next2AM;
  }

  /**
   * Force run the job manually
   */
  async runNow() {
    console.log('🔧 Manually triggering notification lifecycle job...');
    return await this.execute();
  }

  /**
   * Get detailed report of notifications requiring review
   */
  async getPendingReviewReport() {
    try {
      const pendingNotifications = await Notification.aggregate([
        {
          $match: {
            lifecycleStatus: 'pending_review'
          }
        },
        {
          $group: {
            _id: '$notificationGroup',
            count: { $sum: 1 },
            types: { $addToSet: '$type' },
            oldestCreated: { $min: '$createdAt' },
            newestCreated: { $max: '$createdAt' },
            reminderSentAt: { $first: '$reminderSentAt' },
            sampleNotification: { $first: '$$ROOT' }
          }
        },
        {
          $sort: { oldestCreated: 1 }
        }
      ]);

      const totalPending = pendingNotifications.reduce(
        (sum, group) => sum + group.count,
        0
      );

      return {
        totalPendingReview: totalPending,
        groupBreakdown: pendingNotifications,
        urgentGroups: pendingNotifications.filter(group => {
          const daysSinceOldest =
            (Date.now() - new Date(group.oldestCreated).getTime()) /
            (1000 * 60 * 60 * 24);
          return daysSinceOldest > 35; // More than 35 days old
        }),
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Error generating pending review report:', error);
      throw error;
    }
  }

  /**
   * Cleanup old lifecycle data
   */
  async cleanupOldLifecycleData(daysOld = 90) {
    try {
      console.log(
        `🧹 Cleaning up lifecycle data older than ${daysOld} days...`
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Archive very old notifications that have been in pending_review for too long
      const result = await Notification.updateMany(
        {
          lifecycleStatus: 'pending_review',
          reminderSentAt: { $lt: cutoffDate }
        },
        {
          $set: {
            lifecycleStatus: 'archived'
          }
        }
      );

      console.log(`🗄️ Archived ${result.modifiedCount} old notifications`);
      return result.modifiedCount;
    } catch (error) {
      console.error('❌ Error cleaning up old lifecycle data:', error);
      throw error;
    }
  }
}

// Export singleton instance
const notificationLifecycleJob = new NotificationLifecycleJob();
module.exports = notificationLifecycleJob;
