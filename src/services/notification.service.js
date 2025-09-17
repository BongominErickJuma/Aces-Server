/**
 * Notification Service
 * Handles automatic notification creation and MongoDB change streams
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const Quotation = require('../models/Quotation.model');
const Receipt = require('../models/Receipt.model');

class NotificationService {
  constructor() {
    this.changeStreams = new Map();
    this.isMonitoring = false;
  }

  /**
   * Start MongoDB change streams monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('📡 Notification monitoring already started');
      return;
    }

    // Check if MongoDB is running as replica set (required for change streams)
    try {
      const mongoose = require('mongoose');
      const adminDb = mongoose.connection.db.admin();
      const status = await adminDb.replSetGetStatus();

      // Monitor User changes
      await this.monitorUserChanges();

      // Monitor Quotation changes
      await this.monitorQuotationChanges();

      // Monitor Receipt changes
      await this.monitorReceiptChanges();

      this.isMonitoring = true;
      console.log('📡 Notification monitoring started successfully');
    } catch (error) {
      if (
        error.codeName === 'Location40573' ||
        error.message.includes('replica set')
      ) {
        console.log(
          '📡 MongoDB change streams not available (requires replica set)'
        );
        console.log(
          '📡 Notification monitoring will use periodic checks instead'
        );
        this.isMonitoring = true;
        // Set up periodic checks instead
        this.startPeriodicChecks();
      } else {
        console.error('❌ Failed to start notification monitoring:', error);
      }
    }
  }

  /**
   * Stop MongoDB change streams monitoring
   */
  async stopMonitoring() {
    try {
      for (const [name, stream] of this.changeStreams) {
        await stream.close();
        console.log(`📡 Closed change stream: ${name}`);
      }

      this.changeStreams.clear();
      this.isMonitoring = false;
      console.log('📡 Notification monitoring stopped');
    } catch (error) {
      console.error('❌ Failed to stop notification monitoring:', error);
    }
  }

  /**
   * Monitor User collection changes
   */
  async monitorUserChanges() {
    const userChangeStream = User.watch([
      { $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }
    ]);

    userChangeStream.on('change', async change => {
      try {
        await this.handleUserChange(change);
      } catch (error) {
        console.error('❌ Error handling user change:', error);
      }
    });

    this.changeStreams.set('users', userChangeStream);
    console.log('📡 User change stream started');
  }

  /**
   * Monitor Quotation collection changes
   */
  async monitorQuotationChanges() {
    const quotationChangeStream = Quotation.watch([
      { $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }
    ]);

    quotationChangeStream.on('change', async change => {
      try {
        await this.handleQuotationChange(change);
      } catch (error) {
        console.error('❌ Error handling quotation change:', error);
      }
    });

    this.changeStreams.set('quotations', quotationChangeStream);
    console.log('📡 Quotation change stream started');
  }

  /**
   * Monitor Receipt collection changes
   */
  async monitorReceiptChanges() {
    const receiptChangeStream = Receipt.watch([
      { $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }
    ]);

    receiptChangeStream.on('change', async change => {
      try {
        await this.handleReceiptChange(change);
      } catch (error) {
        console.error('❌ Error handling receipt change:', error);
      }
    });

    this.changeStreams.set('receipts', receiptChangeStream);
    console.log('📡 Receipt change stream started');
  }

  /**
   * Handle User collection changes
   */
  async handleUserChange(change) {
    const { operationType, fullDocument, documentKey, updateDescription } =
      change;

    if (operationType === 'insert') {
      // New user created
      const user = fullDocument;
      const admins = await User.find({ role: 'admin', status: 'active' });
      const adminIds = admins.map(admin => admin._id);

      await Notification.createUserNotification(
        'user_created',
        user.fullName,
        user._id,
        user.createdBy,
        adminIds
      );

      // Notify user to complete profile if incomplete
      if (!user.profileCompleted) {
        await Notification.createUserNotification(
          'profile_incomplete',
          user.fullName,
          user._id,
          null,
          [user._id]
        );
      }
    }

    if (operationType === 'update') {
      const userId = documentKey._id;
      const user = await User.findById(userId);

      if (!user) return;

      // Check for role changes
      if (updateDescription?.updatedFields?.role) {
        const admins = await User.find({
          role: 'admin',
          status: 'active',
          _id: { $ne: userId }
        });
        const adminIds = admins.map(admin => admin._id);

        await Notification.createUserNotification(
          'user_role_changed',
          user.fullName,
          user._id,
          null,
          [...adminIds, userId]
        );
      }

      // Check for profile completion
      if (updateDescription?.updatedFields?.profileCompleted === true) {
        const admins = await User.find({ role: 'admin', status: 'active' });
        const adminIds = admins.map(admin => admin._id);

        await Notification.createUserNotification(
          'user_updated',
          user.fullName,
          user._id,
          user._id,
          adminIds
        );
      }
    }

    if (operationType === 'delete') {
      // User deleted - would need to be handled differently since document is gone
      console.log('👤 User deleted:', documentKey._id);
    }
  }

  /**
   * Handle Quotation collection changes
   */
  async handleQuotationChange(change) {
    const { operationType, fullDocument, documentKey, updateDescription } =
      change;

    if (operationType === 'insert') {
      // New quotation created - notify creator and admins
      const quotation = fullDocument;
      const admins = await User.find({ status: 'active', role: 'admin' });
      const adminIds = admins.map(admin => admin._id);

      // Include creator and relevant stakeholders
      const stakeholderIds = new Set([...adminIds, quotation.createdBy]);

      await Notification.createDocumentNotification(
        'document_created',
        'Quotation',
        quotation._id,
        quotation.quotationNumber,
        quotation.createdBy,
        Array.from(stakeholderIds)
      );
    }

    if (operationType === 'update') {
      const quotationId = documentKey._id;
      const quotation = await Quotation.findById(quotationId);

      if (!quotation) return;

      // Check for conversion to receipt
      if (updateDescription?.updatedFields?.converted === true) {
        // Quotation converted - notify all stakeholders (admins + creator)
        const admins = await User.find({ status: 'active', role: 'admin' });
        const adminIds = admins.map(admin => admin._id);
        const stakeholderIds = new Set([...adminIds, quotation.createdBy]);

        await Notification.createDocumentNotification(
          'quotation_converted',
          'Quotation',
          quotation._id,
          quotation.quotationNumber,
          null,
          Array.from(stakeholderIds)
        );
      }

      // Check for status changes
      if (updateDescription?.updatedFields?.status) {
        // Document edited - notify all stakeholders (admins + creator per documentation)
        const admins = await User.find({ status: 'active', role: 'admin' });
        const adminIds = admins.map(admin => admin._id);
        const stakeholderIds = new Set([...adminIds, quotation.createdBy]);

        await Notification.createDocumentNotification(
          'document_updated',
          'Quotation',
          quotation._id,
          quotation.quotationNumber,
          null,
          Array.from(stakeholderIds)
        );
      }
    }

    if (operationType === 'delete') {
      console.log('📄 Quotation deleted:', documentKey._id);
    }
  }

  /**
   * Handle Receipt collection changes
   */
  async handleReceiptChange(change) {
    const { operationType, fullDocument, documentKey, updateDescription } =
      change;

    if (operationType === 'insert') {
      // New receipt created - notify creator and admins
      const receipt = fullDocument;
      const admins = await User.find({ status: 'active', role: 'admin' });
      const adminIds = admins.map(admin => admin._id);

      // Include creator and relevant stakeholders
      const stakeholderIds = new Set([...adminIds, receipt.createdBy]);

      await Notification.createDocumentNotification(
        'document_created',
        'Receipt',
        receipt._id,
        receipt.receiptNumber,
        receipt.createdBy,
        Array.from(stakeholderIds)
      );
    }

    if (operationType === 'update') {
      const receiptId = documentKey._id;
      const receipt = await Receipt.findById(receiptId);

      if (!receipt) return;

      // Check for payment status changes
      if (updateDescription?.updatedFields?.paymentStatus === 'paid') {
        // Payment received - notify creator and admins
        const admins = await User.find({ status: 'active', role: 'admin' });
        const adminIds = admins.map(admin => admin._id);
        const stakeholderIds = new Set([...adminIds, receipt.createdBy]);

        await Notification.createDocumentNotification(
          'payment_received',
          'Receipt',
          receipt._id,
          receipt.receiptNumber,
          null,
          Array.from(stakeholderIds)
        );
      }

      // Check for other status changes
      if (updateDescription?.updatedFields?.status) {
        // Document edited - notify all stakeholders (admins + creator per documentation)
        const admins = await User.find({ status: 'active', role: 'admin' });
        const adminIds = admins.map(admin => admin._id);
        const stakeholderIds = new Set([...adminIds, receipt.createdBy]);

        await Notification.createDocumentNotification(
          'document_updated',
          'Receipt',
          receipt._id,
          receipt.receiptNumber,
          null,
          Array.from(stakeholderIds)
        );
      }
    }

    if (operationType === 'delete') {
      console.log('🧾 Receipt deleted:', documentKey._id);
    }
  }

  /**
   * Check for expired quotations and create notifications
   */
  async checkExpiredQuotations() {
    const today = new Date();
    const expiredQuotations = await Quotation.find({
      validUntil: { $lt: today },
      status: 'active',
      converted: false
    });

    for (const quotation of expiredQuotations) {
      // Quotation expired - notify all stakeholders (admins + creator)
      const admins = await User.find({ status: 'active', role: 'admin' });
      const adminIds = admins.map(admin => admin._id);
      const stakeholderIds = new Set([...adminIds, quotation.createdBy]);

      await Notification.createDocumentNotification(
        'quotation_expired',
        'Quotation',
        quotation._id,
        quotation.quotationNumber,
        null,
        Array.from(stakeholderIds)
      );

      // Update quotation status to expired
      quotation.status = 'expired';
      await quotation.save();
    }

    if (expiredQuotations.length > 0) {
      console.log(
        `⏰ ${expiredQuotations.length} quotations marked as expired`
      );
    }
  }

  /**
   * Check for overdue payments and create notifications
   */
  async checkOverduePayments() {
    const today = new Date();
    const overdueReceipts = await Receipt.find({
      dueDate: { $lt: today },
      paymentStatus: 'pending'
    });

    for (const receipt of overdueReceipts) {
      // Payment overdue - notify all stakeholders (admins + creator)
      const admins = await User.find({ status: 'active', role: 'admin' });
      const adminIds = admins.map(admin => admin._id);
      const stakeholderIds = new Set([...adminIds, receipt.createdBy]);

      await Notification.createDocumentNotification(
        'payment_overdue',
        'Receipt',
        receipt._id,
        receipt.receiptNumber,
        null,
        Array.from(stakeholderIds)
      );
    }

    if (overdueReceipts.length > 0) {
      console.log(`💰 ${overdueReceipts.length} receipts are overdue`);
    }
  }

  /**
   * Create system notification for all users
   */
  async createSystemNotification(type, title, message, priority = 'normal') {
    const allUsers = await User.find({ status: 'active' });
    const userIds = allUsers.map(user => user._id);

    const notifications = userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      priority,
      metadata: {
        system: true
      }
    }));

    return await Notification.insertMany(notifications);
  }

  /**
   * Start periodic checks (alternative to change streams)
   */
  startPeriodicChecks() {
    console.log('📡 Starting periodic checks as fallback for change streams');

    // Run checks every 10 minutes
    setInterval(
      () => {
        this.runPeriodicChecks();
      },
      10 * 60 * 1000
    );

    // Run initial check after 1 minute
    setTimeout(() => {
      this.runPeriodicChecks();
    }, 60 * 1000);
  }

  /**
   * Manually trigger notifications for document creation (when change streams unavailable)
   */
  async triggerDocumentNotification(
    documentType,
    documentId,
    operationType = 'insert'
  ) {
    try {
      if (documentType === 'quotation') {
        const quotation = await Quotation.findById(documentId);
        if (quotation && operationType === 'insert') {
          await this.handleQuotationChange({
            operationType: 'insert',
            fullDocument: quotation,
            documentKey: { _id: documentId }
          });
        }
      } else if (documentType === 'receipt') {
        const receipt = await Receipt.findById(documentId);
        if (receipt && operationType === 'insert') {
          await this.handleReceiptChange({
            operationType: 'insert',
            fullDocument: receipt,
            documentKey: { _id: documentId }
          });
        }
      } else if (documentType === 'user') {
        const user = await User.findById(documentId);
        if (user && operationType === 'insert') {
          await this.handleUserChange({
            operationType: 'insert',
            fullDocument: user,
            documentKey: { _id: documentId }
          });
        }
      }
    } catch (error) {
      console.error('❌ Error in manual notification trigger:', error);
    }
  }

  /**
   * Run periodic checks (to be called by a cron job)
   */
  async runPeriodicChecks() {
    console.log('🔄 Running periodic notification checks...');

    try {
      await this.checkExpiredQuotations();
      await this.checkOverduePayments();

      console.log('✅ Periodic notification checks completed');
    } catch (error) {
      console.error('❌ Error in periodic notification checks:', error);
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;
