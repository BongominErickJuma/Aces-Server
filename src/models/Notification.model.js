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
      index: { expireAfterSeconds: 0 } // TTL index for auto-deletion
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

// Pre-save middleware to set expiry date
notificationSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    // Set default expiry based on priority
    const expiryDays = {
      low: 7, // 1 week
      normal: 30, // 1 month
      high: 90, // 3 months
      urgent: 180 // 6 months
    };

    const days = expiryDays[this.priority] || 30;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    this.expiresAt = expiryDate;
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
    userId,
    read: false,
    $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }]
  });
};

// Static method to mark all notifications as read for user
notificationSchema.statics.markAllAsReadForUser = function (userId) {
  return this.updateMany(
    { userId, read: false },
    {
      $set: {
        read: true,
        readAt: new Date()
      }
    }
  );
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

  const notifications = recipientIds.map(userId => ({
    userId,
    type,
    title: titles[type] || 'Document Notification',
    message:
      messages[type] || `${documentType} ${documentNumber} has been updated`,
    actionUrl: actionUrls[documentType.toLowerCase()],
    actionText: 'View Details',
    actorId,
    metadata: {
      documentType,
      documentId,
      documentNumber
    },
    priority: type.includes('overdue') ? 'high' : 'normal'
  }));

  return await this.insertMany(notifications);
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
    profile_incomplete: 'Complete Your Profile'
  };

  const messages = {
    user_created: `${userName} has been added to the system`,
    user_updated: `${userName}'s profile has been updated`,
    user_role_changed: `${userName}'s role has been changed`,
    user_deleted: `${userName} has been removed from the system`,
    profile_incomplete: 'Please complete your profile to access all features'
  };

  const notifications = recipientIds.map(recipientId => ({
    userId: recipientId,
    type,
    title: titles[type] || 'User Notification',
    message: messages[type] || `User ${userName} has been updated`,
    actionUrl:
      type === 'profile_incomplete' ? '/profile' : `/admin/users/${userId}`,
    actionText:
      type === 'profile_incomplete' ? 'Complete Profile' : 'View Details',
    actorId,
    metadata: {
      targetUserId: userId,
      userName
    },
    priority: type === 'profile_incomplete' ? 'high' : 'normal'
  }));

  return await this.insertMany(notifications);
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function () {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Instance method to mark as unread
notificationSchema.methods.markAsUnread = function () {
  this.read = false;
  this.readAt = null;
  return this.save();
};

// Add pagination plugin
notificationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Notification', notificationSchema);
