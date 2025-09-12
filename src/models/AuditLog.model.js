/**
 * Audit Log Model
 * Tracks all system activities for security and compliance
 */

const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      enum: {
        values: [
          // Authentication actions
          'LOGIN',
          'LOGOUT',
          'LOGIN_FAILED',
          'PASSWORD_RESET_REQUESTED',
          'PASSWORD_RESET_COMPLETED',
          'TOKEN_REFRESHED',

          // User management actions
          'USER_CREATED',
          'USER_UPDATED',
          'USER_DELETED',
          'USER_ROLE_CHANGED',
          'PROFILE_UPDATED',
          'AVATAR_UPLOADED',

          // Document actions
          'QUOTATION_CREATED',
          'QUOTATION_UPDATED',
          'QUOTATION_DELETED',
          'QUOTATION_PDF_GENERATED',
          'QUOTATION_SENT',
          'QUOTATION_CONVERTED',
          'RECEIPT_CREATED',
          'RECEIPT_UPDATED',
          'RECEIPT_DELETED',
          'RECEIPT_PDF_GENERATED',
          'RECEIPT_SENT',

          // Payment actions
          'PAYMENT_RECORDED',
          'PAYMENT_REFUNDED',
          'PAYMENT_STATUS_CHANGED',

          // System actions
          'SETTINGS_UPDATED',
          'BACKUP_CREATED',
          'SYSTEM_MAINTENANCE',
          'FILE_UPLOADED',
          'FILE_DELETED',

          // Security actions
          'SUSPICIOUS_ACTIVITY',
          'RATE_LIMIT_EXCEEDED',
          'UNAUTHORIZED_ACCESS',
          'DATA_EXPORT',
          'BULK_DELETE'
        ],
        message: 'Invalid audit action'
      }
    },
    entityType: {
      type: String,
      trim: true,
      enum: {
        values: [
          'User',
          'Quotation',
          'Receipt',
          'Notification',
          'System',
          'File'
        ],
        message: 'Invalid entity type'
      }
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId
      // Reference to the affected entity (User, Quotation, Receipt, etc.)
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed
      // Store previous values for update operations
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed
      // Store new values for create/update operations
    },
    details: {
      type: String,
      trim: true,
      maxlength: [1000, 'Details cannot exceed 1000 characters']
      // Additional context about the action
    },
    ipAddress: {
      type: String,
      required: [true, 'IP address is required'],
      trim: true,
      match: [
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^::1$|^localhost$/,
        'Invalid IP address format'
      ]
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'User agent cannot exceed 500 characters']
    },
    success: {
      type: Boolean,
      default: true,
      index: true
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: [500, 'Error message cannot exceed 500 characters']
    },
    duration: {
      type: Number,
      // Time taken for the operation in milliseconds
      min: [0, 'Duration cannot be negative']
    },
    riskLevel: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: 'Risk level must be low, medium, high, or critical'
      },
      default: 'low',
      index: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance and querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });
auditLogSchema.index({ success: 1, createdAt: -1 });
auditLogSchema.index({ riskLevel: 1, createdAt: -1 });

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ riskLevel: 1, success: 1, createdAt: -1 });

// TTL index to auto-delete old logs (keep for 2 years)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years in seconds

// Virtual for formatting creation date
auditLogSchema.virtual('formattedDate').get(function () {
  return this.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD format
});

// Virtual for determining if action was recent (within last hour)
auditLogSchema.virtual('isRecent').get(function () {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.createdAt > oneHourAgo;
});

// Static method to log action
auditLogSchema.statics.logAction = async function (logData) {
  // Set risk level based on action
  if (!logData.riskLevel) {
    logData.riskLevel = this.determineRiskLevel(logData.action);
  }

  const auditLog = new this(logData);
  return await auditLog.save();
};

// Static method to determine risk level
auditLogSchema.statics.determineRiskLevel = function (action) {
  const riskMapping = {
    // Critical risk actions
    USER_DELETED: 'critical',
    BULK_DELETE: 'critical',
    SYSTEM_MAINTENANCE: 'critical',
    USER_ROLE_CHANGED: 'critical',
    SUSPICIOUS_ACTIVITY: 'critical',
    UNAUTHORIZED_ACCESS: 'critical',

    // High risk actions
    USER_CREATED: 'high',
    PASSWORD_RESET_COMPLETED: 'high',
    QUOTATION_DELETED: 'high',
    RECEIPT_DELETED: 'high',
    PAYMENT_REFUNDED: 'high',
    DATA_EXPORT: 'high',
    SETTINGS_UPDATED: 'high',

    // Medium risk actions
    LOGIN_FAILED: 'medium',
    RATE_LIMIT_EXCEEDED: 'medium',
    USER_UPDATED: 'medium',
    QUOTATION_UPDATED: 'medium',
    RECEIPT_UPDATED: 'medium',
    PAYMENT_RECORDED: 'medium',

    // Low risk actions (default)
    LOGIN: 'low',
    LOGOUT: 'low',
    QUOTATION_CREATED: 'low',
    RECEIPT_CREATED: 'low',
    PDF_GENERATED: 'low',
    FILE_UPLOADED: 'low'
  };

  return riskMapping[action] || 'low';
};

// Static method to find logs by user
auditLogSchema.statics.findByUser = function (userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'fullName email');
};

// Static method to find logs by entity
auditLogSchema.statics.findByEntity = function (
  entityType,
  entityId,
  limit = 20
) {
  return this.find({ entityType, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'fullName email');
};

// Static method to find failed actions
auditLogSchema.statics.findFailedActions = function (hours = 24) {
  const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    success: false,
    createdAt: { $gte: cutoffDate }
  }).sort({ createdAt: -1 });
};

// Static method to find high-risk activities
auditLogSchema.statics.findHighRiskActivities = function (hours = 24) {
  const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    riskLevel: { $in: ['high', 'critical'] },
    createdAt: { $gte: cutoffDate }
  }).sort({ createdAt: -1 });
};

// Static method to get activity summary
auditLogSchema.statics.getActivitySummary = async function (userId, days = 30) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastAction: { $max: '$createdAt' },
        success: { $sum: { $cond: ['$success', 1, 0] } },
        failed: { $sum: { $cond: ['$success', 0, 1] } }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Static method to detect suspicious patterns
auditLogSchema.statics.detectSuspiciousActivity = async function (
  userId,
  hours = 24
) {
  const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

  const results = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          ipAddress: '$ipAddress',
          hour: { $hour: '$createdAt' }
        },
        count: { $sum: 1 },
        failed: { $sum: { $cond: ['$success', 0, 1] } }
      }
    },
    {
      $match: {
        $or: [
          { count: { $gte: 10 } }, // High frequency
          { failed: { $gte: 5 } }, // Multiple failures
          { '_id.action': 'LOGIN_FAILED' } // Failed logins
        ]
      }
    }
  ]);

  return results;
};

// Static method to clean old logs
auditLogSchema.statics.cleanOldLogs = function (days = 730) {
  // 2 years default
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoffDate } });
};

// Add pagination plugin
auditLogSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('AuditLog', auditLogSchema);
