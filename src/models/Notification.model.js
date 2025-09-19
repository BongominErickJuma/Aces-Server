/**
 * Notification Model
 * Handles system notifications and user alerts
 */

const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    notificationGroup: {
      type: String,
      required: true,
      index: true
    },
    recipientUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    readByUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isReadByAllUsers: {
      type: Boolean,
      default: false,
      index: true
    },
    adminManaged: {
      type: Boolean,
      default: true
    },
    lifecycleStatus: {
      type: String,
      enum: ['active', 'pending_review', 'extended', 'archived'],
      default: 'active',
      index: true
    },
    reminderSentAt: {
      type: Date,
      index: true
    },
    extendedUntil: {
      type: Date,
      index: true
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: {
        values: [
          // Document events
          'document_created',
          'document_updated',
          'document_deleted',
          'quotation_expired',
          'quotation_converted',
          'payment_received',
          'payment_overdue',

          // User events
          'user_created',
          'user_updated',
          'user_role_changed',
          'user_deleted',
          'user_suspended',
          'user_reactivated',
          'profile_incomplete',

          // System events
          'system_maintenance',
          'backup_completed',
          'security_alert'
        ],
        message: 'Invalid notification type'
      }
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters']
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'normal', 'high', 'urgent'],
        message: 'Priority must be low, normal, high, or urgent'
      },
      default: 'normal'
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: [200, 'Action URL cannot exceed 200 characters']
    },
    actionText: {
      type: String,
      trim: true,
      maxlength: [50, 'Action text cannot exceed 50 characters']
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
      // The user who performed the action that triggered this notification
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
      // Additional data related to the notification
      // e.g., document ID, payment amount, etc.
    },
    readAt: {
      type: Date
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ actorId: 1 });
notificationSchema.index({ notificationGroup: 1 });
notificationSchema.index({ recipientUserIds: 1 });
notificationSchema.index({ lifecycleStatus: 1, expiresAt: 1 });
notificationSchema.index({ reminderSentAt: 1 });
notificationSchema.index({ extendedUntil: 1 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for time since created
notificationSchema.virtual('timeAgo').get(function () {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffInSeconds = Math.floor((now - created) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
});

// Pre-save middleware to generate notification group if not provided
notificationSchema.pre('save', function (next) {
  // Generate notification group based on type and date if not provided
  if (!this.notificationGroup) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    this.notificationGroup = `${this.type}_${dateStr}_${Date.now()}`;
  }

  // Set recipientUserIds to include userId if not already set
  if (
    this.isNew &&
    (!this.recipientUserIds || this.recipientUserIds.length === 0)
  ) {
    this.recipientUserIds = [this.userId];
  }

  next();
});

// Pre-save middleware to set readAt timestamp
notificationSchema.pre('save', function (next) {
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  next();
});

// Static method to create notification
notificationSchema.statics.createNotification = async function (
  notificationData
) {
  // Ensure notificationGroup is set if not provided
  if (!notificationData.notificationGroup) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    notificationData.notificationGroup = `${notificationData.type}_${dateStr}_${Date.now()}`;
  }

  const notification = new this(notificationData);
  return await notification.save();
};

// Static method to find unread notifications for user
notificationSchema.statics.findUnreadForUser = function (userId) {
  return this.find({
    userId,
    read: false,
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }]
  }).sort({ createdAt: -1 });
};

// Static method to get notification count for user
notificationSchema.statics.getUnreadCountForUser = function (userId) {
  return this.countDocuments({
    recipientUserIds: userId,
    'readByUsers.userId': { $ne: userId },
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }]
  });
};

// Static method to mark all notifications as read for user
notificationSchema.statics.markAllAsReadForUser = async function (userId) {
  // Find notifications where user is a recipient but hasn't read yet
  const notifications = await this.find({
    recipientUserIds: userId,
    'readByUsers.userId': { $ne: userId }
  });

  let modifiedCount = 0;
  for (const notification of notifications) {
    // Add user to readByUsers array
    notification.readByUsers.push({
      userId: userId,
      readAt: new Date()
    });

    // Check if all recipients have read this notification
    const allRead = notification.recipientUserIds.every(recipientId =>
      notification.readByUsers.some(reader => reader.userId.equals(recipientId))
    );

    if (allRead) {
      notification.isReadByAllUsers = true;
      notification.read = true;
      notification.readAt = new Date();
    }

    await notification.save();
    modifiedCount++;
  }

  return { modifiedCount };
};

// Static method to delete old notifications
notificationSchema.statics.deleteOldNotifications = function (days = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    read: true
  });
};

// Static method to create document notifications
notificationSchema.statics.createDocumentNotification = async function (
  type,
  documentType,
  documentId,
  documentNumber,
  actorId,
  recipientIds = []
) {
  const titles = {
    document_created: `New ${documentType} Created`,
    document_updated: `${documentType} Updated`,
    document_deleted: `${documentType} Deleted`,
    quotation_expired: 'Quotation Expired',
    quotation_converted: 'Quotation Converted',
    payment_received: 'Payment Received',
    payment_overdue: 'Payment Overdue'
  };

  const messages = {
    document_created: `${documentType} ${documentNumber} has been created`,
    document_updated: `${documentType} ${documentNumber} has been updated`,
    document_deleted: `${documentType} ${documentNumber} has been deleted`,
    quotation_expired: `Quotation ${documentNumber} has expired`,
    quotation_converted: `Quotation ${documentNumber} has been converted to receipt`,
    payment_received: `Payment received for ${documentType} ${documentNumber}`,
    payment_overdue: `Payment for ${documentType} ${documentNumber} is overdue`
  };

  const actionUrls = {
    quotation: `/quotations/${documentId}`,
    receipt: `/receipts/${documentId}`
  };

  // Generate notification group for this document event
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const notificationGroup = `${type}_${documentId}_${dateStr}`;

  // Create a single notification document with all recipients
  const notification = {
    userId: recipientIds[0], // Primary recipient (for legacy compatibility)
    type,
    title: titles[type] || 'Document Notification',
    message:
      messages[type] || `${documentType} ${documentNumber} has been updated`,
    actionUrl: actionUrls[documentType.toLowerCase()],
    actionText: 'View Details',
    actorId,
    notificationGroup,
    recipientUserIds: recipientIds,
    metadata: {
      documentType,
      documentId,
      documentNumber
    },
    priority: type.includes('overdue') ? 'high' : 'normal'
  };

  return await this.create(notification);
};

// Static method to create document notifications with detailed changes
notificationSchema.statics.createDocumentNotificationWithDetails =
  async function (
    type,
    documentType,
    documentId,
    documentNumber,
    actorId,
    recipientIds = [],
    changes = []
  ) {
    const title = `${documentType} ${documentNumber} Updated`;

    // Build detailed message with changes
    let message = `${documentType} ${documentNumber} has been updated`;
    if (changes.length > 0) {
      const changeDetails = changes
        .map(change => {
          // Format values for display
          let displayOldValue = change.oldValue;
          let displayNewValue = change.newValue;

          if (typeof displayOldValue === 'object' && displayOldValue !== null) {
            displayOldValue = JSON.stringify(displayOldValue);
          }
          if (typeof displayNewValue === 'object' && displayNewValue !== null) {
            displayNewValue = JSON.stringify(displayNewValue);
          }

          if (change.oldValue && change.oldValue !== 'Not set') {
            return `${change.field} changed from ${displayOldValue} to ${displayNewValue}`;
          } else {
            return `${change.field} changed to ${displayNewValue}`;
          }
        })
        .join(', ');
      message = `User changed ${documentType} ${documentNumber}: ${changeDetails}`;
    }

    const actionUrls = {
      quotation: `/quotations/${documentId}`,
      receipt: `/receipts/${documentId}`
    };

    // Generate notification group for this document event
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const notificationGroup = `${type}_${documentId}_${dateStr}`;

    // Create a single notification document with all recipients
    const notification = {
      userId: recipientIds[0], // Primary recipient (for legacy compatibility)
      type,
      title,
      message:
        message.length > 500 ? message.substring(0, 497) + '...' : message,
      actionUrl: actionUrls[documentType.toLowerCase()],
      actionText: 'View Details',
      actorId,
      notificationGroup,
      recipientUserIds: recipientIds,
      metadata: {
        documentType,
        documentId,
        documentNumber,
        changes
      },
      priority: 'normal'
    };

    return await this.create(notification);
  };

// Static method to create user notifications
notificationSchema.statics.createUserNotification = async function (
  type,
  userName,
  userId,
  actorId,
  recipientIds = []
) {
  const titles = {
    user_created: 'New User Added',
    user_updated: 'User Profile Updated',
    user_role_changed: 'User Role Changed',
    user_deleted: 'User Removed',
    user_suspended: 'User Suspended',
    user_reactivated: 'User Reactivated',
    profile_incomplete: 'Complete Your Profile'
  };

  const messages = {
    user_created: `${userName} has been added to the system`,
    user_updated: `${userName}'s profile has been updated`,
    user_role_changed: `${userName}'s role has been changed`,
    user_deleted: `${userName} has been removed from the system`,
    user_suspended: `${userName} has been suspended`,
    user_reactivated: `${userName}'s account has been reactivated`,
    profile_incomplete: 'Please complete your profile to access all features'
  };

  // Generate notification group for this user event
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const notificationGroup = `${type}_${userId}_${dateStr}`;

  // Create a single notification document with all recipients
  const notification = {
    userId: recipientIds[0], // Primary recipient (for legacy compatibility)
    type,
    title: titles[type] || 'User Notification',
    message: messages[type] || `User ${userName} has been updated`,
    actionUrl:
      type === 'profile_incomplete' ? '/profile' : `/admin/users/${userId}`,
    actionText:
      type === 'profile_incomplete' ? 'Complete Profile' : 'View Details',
    actorId,
    notificationGroup,
    recipientUserIds: recipientIds,
    metadata: {
      targetUserId: userId,
      userName
    },
    priority: type === 'profile_incomplete' ? 'high' : 'normal'
  };

  return await this.create(notification);
};

// Static method to create user suspension/deletion/reactivation notifications
notificationSchema.statics.createUserSuspensionNotification = async function (
  type,
  userName,
  userId,
  actorId,
  recipientIds = []
) {
  const titles = {
    user_suspended: 'User Suspended',
    user_deleted: 'User Removed',
    user_reactivated: 'User Reactivated'
  };

  const messages = {
    user_suspended: `${userName} has been suspended`,
    user_deleted: `${userName} has been removed from the team`,
    user_reactivated: `${userName}'s account has been reactivated`
  };

  // Generate notification group for this user event
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const notificationGroup = `${type}_${userId}_${dateStr}`;

  // Create a single notification document with all recipients
  const notification = {
    userId: recipientIds[0], // Primary recipient (for legacy compatibility)
    type,
    title: titles[type] || 'User Notification',
    message: messages[type] || `User ${userName} status has changed`,
    actorId,
    notificationGroup,
    recipientUserIds: recipientIds,
    metadata: {
      targetUserId: userId,
      userName
    },
    priority: 'high'
  };

  return await this.create(notification);
};

// Static method to create user notifications with detailed changes
notificationSchema.statics.createUserNotificationWithDetails = async function (
  type,
  userName,
  userId,
  actorId,
  recipientIds = [],
  changes = []
) {
  const title = 'User Profile Updated';

  // Build detailed message with changes
  let message = `${userName}'s profile has been updated`;
  if (changes.length > 0) {
    const changeDetails = changes
      .map(change => {
        if (change.oldValue && change.oldValue !== 'Not set') {
          return `${change.field} changed from ${change.oldValue} to ${change.newValue}`;
        } else {
          return `${change.field} changed to ${change.newValue}`;
        }
      })
      .join(', ');
    message = `${userName} changed: ${changeDetails}`;
  }

  // Generate notification group for this user event
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const notificationGroup = `${type}_${userId}_${dateStr}`;

  // Create a single notification document with all recipients
  const notification = {
    userId: recipientIds[0], // Primary recipient (for legacy compatibility)
    type,
    title,
    message: message.length > 500 ? message.substring(0, 497) + '...' : message,
    actionUrl: `/admin/users/${userId}`,
    actionText: 'View Details',
    actorId,
    notificationGroup,
    recipientUserIds: recipientIds,
    metadata: {
      targetUserId: userId,
      userName,
      changes
    },
    priority: 'normal'
  };

  return await this.create(notification);
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function (userId = null) {
  // Only add to readByUsers if userId provided and not already read by this user
  if (userId && !this.readByUsers.find(r => r.userId.equals(userId))) {
    this.readByUsers.push({
      userId: userId,
      readAt: new Date()
    });

    // Check if all recipients have read this notification
    const allRead = this.recipientUserIds.every(recipientId =>
      this.readByUsers.some(reader => reader.userId.equals(recipientId))
    );

    if (allRead) {
      this.isReadByAllUsers = true;
      // Only set global read flag when ALL users have read it
      this.read = true;
      this.readAt = new Date();
    }
  }

  return this.save();
};

// Instance method to mark as unread
notificationSchema.methods.markAsUnread = function (userId = null) {
  // Remove from readByUsers if userId provided
  if (userId) {
    this.readByUsers = this.readByUsers.filter(r => !r.userId.equals(userId));
    this.isReadByAllUsers = false;

    // Only set global read to false if no users have read it
    if (this.readByUsers.length === 0) {
      this.read = false;
      this.readAt = null;
    }
  }

  return this.save();
};

// Static method to calculate and update read status for notifications
notificationSchema.statics.updateReadStatus = async function (
  notificationIds = []
) {
  const filter =
    notificationIds.length > 0 ? { _id: { $in: notificationIds } } : {};

  const notifications = await this.find(filter);
  let updatedCount = 0;

  for (const notification of notifications) {
    const allRead = notification.recipientUserIds.every(recipientId =>
      notification.readByUsers.some(reader => reader.userId.equals(recipientId))
    );

    if (allRead !== notification.isReadByAllUsers) {
      notification.isReadByAllUsers = allRead;
      await notification.save();
      updatedCount++;
    }
  }

  return updatedCount;
};

// Static method to get notifications that need read status update
notificationSchema.statics.getNotificationsNeedingReadUpdate = function () {
  return this.aggregate([
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
      $project: { _id: 1 }
    }
  ]);
};

// Add pagination plugin
notificationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Notification', notificationSchema);
