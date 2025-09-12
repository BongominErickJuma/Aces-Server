/**
 * Audit Service
 * Handles audit logging for system events and user actions
 */

const AuditLog = require('../models/AuditLog.model');

class AuditService {
  /**
   * Log user authentication events
   */
  static async logAuthEvent(type, userId, ipAddress, userAgent, details = {}) {
    try {
      const auditData = {
        action: type,
        entityType: 'User',
        entityId: userId,
        userId: userId,
        ipAddress,
        userAgent,
        details: {
          authType: type,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }

  /**
   * Log document operations (create, update, delete)
   */
  static async logDocumentEvent(
    action,
    entityType,
    entityId,
    userId,
    ipAddress,
    changes = {}
  ) {
    try {
      const auditData = {
        action,
        entityType,
        entityId,
        userId,
        ipAddress,
        details: {
          changes,
          timestamp: new Date()
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log document event:', error);
    }
  }

  /**
   * Log user management events
   */
  static async logUserEvent(
    action,
    targetUserId,
    performedBy,
    ipAddress,
    details = {}
  ) {
    try {
      const auditData = {
        action,
        entityType: 'User',
        entityId: targetUserId,
        userId: performedBy,
        ipAddress,
        details: {
          userAction: action,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log user event:', error);
    }
  }

  /**
   * Log file upload events
   */
  static async logUploadEvent(
    action,
    fileType,
    fileId,
    userId,
    ipAddress,
    details = {}
  ) {
    try {
      const auditData = {
        action,
        entityType: 'File',
        entityId: fileId,
        userId,
        ipAddress,
        details: {
          fileType,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log upload event:', error);
    }
  }

  /**
   * Log system events
   */
  static async logSystemEvent(action, details = {}, performedBy = null) {
    try {
      const auditData = {
        action,
        entityType: 'System',
        entityId: null,
        userId: performedBy,
        ipAddress: null,
        details: {
          systemEvent: true,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log system event:', error);
    }
  }

  /**
   * Log security events
   */
  static async logSecurityEvent(
    action,
    severity,
    ipAddress,
    userId = null,
    details = {}
  ) {
    try {
      const auditData = {
        action,
        entityType: 'Security',
        entityId: null,
        userId,
        ipAddress,
        details: {
          severity,
          securityEvent: true,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Log email events
   */
  static async logEmailEvent(action, recipientEmail, userId, details = {}) {
    try {
      const auditData = {
        action,
        entityType: 'Email',
        entityId: null,
        userId,
        ipAddress: null,
        details: {
          recipientEmail,
          emailEvent: true,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log email event:', error);
    }
  }

  /**
   * Log payment events
   */
  static async logPaymentEvent(
    action,
    receiptId,
    amount,
    userId,
    ipAddress,
    details = {}
  ) {
    try {
      const auditData = {
        action,
        entityType: 'Payment',
        entityId: receiptId,
        userId,
        ipAddress,
        details: {
          amount,
          paymentEvent: true,
          ...details
        }
      };

      await AuditLog.create(auditData);
    } catch (error) {
      console.error('Failed to log payment event:', error);
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  static async getAuditLogs(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 50,
      sort = '-createdAt',
      populate = 'userId'
    } = options;

    const query = AuditLog.find(filters);

    if (populate) {
      query.populate(populate, 'fullName email');
    }

    const result = await AuditLog.paginate(query, {
      page,
      limit,
      sort
    });

    return result;
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats(dateRange = {}) {
    const { startDate, endDate } = dateRange;
    const matchStage = {};

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$createdAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const entityStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$entityType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const userStats = await AuditLog.aggregate([
      {
        $match: {
          ...matchStage,
          userId: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          actions: { $addToSet: '$action' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return {
      actionStats: stats,
      entityStats,
      topUsers: userStats,
      totalEvents: await AuditLog.countDocuments(matchStage)
    };
  }

  /**
   * Clean up old audit logs (keep for compliance period)
   */
  static async cleanupOldLogs(retentionDays = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await AuditLog.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    if (result.deletedCount > 0) {
      await this.logSystemEvent('audit_cleanup', {
        deletedCount: result.deletedCount,
        retentionDays,
        cutoffDate
      });
    }

    return result;
  }

  /**
   * Search audit logs
   */
  static async searchLogs(searchTerm, filters = {}, options = {}) {
    const searchRegex = new RegExp(searchTerm, 'i');

    const searchQuery = {
      ...filters,
      $or: [
        { action: searchRegex },
        { entityType: searchRegex },
        { 'details.changes.field': searchRegex },
        { 'details.description': searchRegex }
      ]
    };

    return this.getAuditLogs(searchQuery, options);
  }
}

module.exports = AuditService;
