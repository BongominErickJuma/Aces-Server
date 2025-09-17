/**
 * Receipt Controller
 * Handles CRUD operations for receipts
 */

const { Receipt, Quotation } = require('../models');
const ApiResponse = require('../utils/response');
const { validationResult } = require('express-validator');
const pdfService = require('../services/pdf.service');

/**
 * Get all receipts with filtering, sorting, and pagination
 */
const getReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      receiptType,
      paymentStatus,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
      createdBy,
      overdue
    } = req.query;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter object
    const filter = {};

    // User role-based filtering
    if (req.user.role !== 'admin') {
      filter.createdBy = req.user._id;
    } else if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (receiptType) filter.receiptType = receiptType;
    if (paymentStatus) filter['payment.status'] = paymentStatus;

    // Overdue filter
    if (overdue === 'true') {
      filter['payment.dueDate'] = { $lt: new Date() };
      filter['payment.status'] = { $in: ['pending', 'partial'] };
    }

    // Date range filtering
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Text search
    if (search) {
      filter.$or = [
        { receiptNumber: { $regex: search, $options: 'i' } },
        { 'client.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries in parallel
    const [receipts, totalCount] = await Promise.all([
      Receipt.find(filter)
        .populate('createdBy', 'fullName email')
        .populate('quotationId', 'quotationNumber type')
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Receipt.countDocuments(filter)
    ]);

    ApiResponse.paginated(
      res,
      receipts,
      {
        page: pageNumber,
        limit: limitNumber,
        total: totalCount
      },
      'Receipts retrieved successfully'
    );
  } catch (error) {
    console.error('Get receipts error:', error);
    ApiResponse.error(res, 'Failed to retrieve receipts', 500);
  }
};

/**
 * Get single receipt by ID
 */
const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;

    const receipt = await Receipt.findById(id)
      .populate('createdBy', 'fullName email phonePrimary')
      .populate('quotationId', 'quotationNumber type client locations')
      .populate('payment.paymentHistory.receivedBy', 'fullName')
      .populate('versions.editedBy', 'fullName');

    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    ApiResponse.success(res, { receipt }, 'Receipt retrieved successfully');
  } catch (error) {
    console.error('Get receipt by ID error:', error);
    ApiResponse.error(res, 'Failed to retrieve receipt', 500);
  }
};

/**
 * Create new receipt
 */
const createReceipt = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    // Generate receipt number
    const receiptNumber = await Receipt.generateReceiptNumber(
      req.body.receiptType
    );

    let services;
    let totalAmount;
    let amountPaid = 0;

    // Special handling based on receipt type
    if (req.body.receiptType === 'commitment') {
      // COMMITMENT RECEIPT: No services array, just store the values
      const commitmentFeePaid = req.body.commitmentFeePaid || 0;
      const totalMovingAmount = req.body.totalMovingAmount || 0;

      services = []; // No services for commitment receipts
      totalAmount = totalMovingAmount;
      amountPaid = commitmentFeePaid;
    } else if (req.body.receiptType === 'final') {
      // FINAL RECEIPT: No services array
      const commitmentFeePaid = req.body.commitmentFeePaid || 0;
      const finalPaymentReceived = req.body.finalPaymentReceived || 0;
      const grandTotal = commitmentFeePaid + finalPaymentReceived;

      services = []; // No services for final receipts
      totalAmount = grandTotal;
      amountPaid = grandTotal; // Final receipt means fully paid
    } else if (req.body.receiptType === 'one_time') {
      // ONE TIME PAYMENT RECEIPT: No services array
      const totalMovingAmount = req.body.totalMovingAmount || 0;

      services = []; // No services for one-time receipts
      totalAmount = totalMovingAmount;
      amountPaid = totalMovingAmount; // One-time payment means fully paid
    } else if (req.body.receiptType === 'box') {
      // BOX RECEIPT: Has services but no location details
      services = req.body.services.map(service => ({
        ...service,
        quantity: service.quantity || 1,
        total: (service.quantity || 1) * service.amount
      }));

      // Calculate total amount from services
      totalAmount = services.reduce((sum, service) => sum + service.total, 0);
      amountPaid = req.body.payment?.amountPaid || 0;
    } else {
      // Default handling for any other types
      services = req.body.services.map(service => ({
        ...service,
        quantity: service.quantity || 1,
        total: (service.quantity || 1) * service.amount
      }));

      // Calculate total amount from services
      totalAmount = services.reduce((sum, service) => sum + service.total, 0);
      amountPaid = req.body.payment?.amountPaid || 0;
    }

    // Create receipt data
    const receiptData = {
      ...req.body,
      receiptNumber,
      services,
      payment: {
        ...req.body.payment,
        totalAmount: totalAmount,
        amountPaid: amountPaid,
        balance: totalAmount - amountPaid
      },
      // Store the specific amounts for each receipt type
      commitmentFeePaid: req.body.commitmentFeePaid,
      totalMovingAmount: req.body.totalMovingAmount,
      finalPaymentReceived: req.body.finalPaymentReceived,
      createdBy: req.user._id
    };

    // Set edit tracking for versioning
    receiptData._editedBy = req.user._id;

    const receipt = new Receipt(receiptData);
    await receipt.save();

    // Populate created receipt
    await receipt.populate([
      { path: 'createdBy', select: 'fullName email' },
      { path: 'quotationId', select: 'quotationNumber type' }
    ]);

    // Trigger notification via notification service
    try {
      const notificationService = require('../services/notification.service');
      if (!notificationService.isMonitoring) {
        // If change streams aren't working, manually trigger notification
        await notificationService.triggerDocumentNotification(
          'receipt',
          receipt._id,
          'insert'
        );
      }
    } catch (notifError) {
      console.error('Failed to trigger notification:', notifError);
    }

    ApiResponse.success(res, { receipt }, 'Receipt created successfully', 201);
  } catch (error) {
    console.error('Create receipt error:', error);

    if (error.name === 'ValidationError') {
      return ApiResponse.validationError(res, Object.values(error.errors));
    }

    ApiResponse.error(res, 'Failed to create receipt', 500);
  }
};

/**
 * Update receipt
 */
const updateReceipt = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    const { id } = req.params;

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    // Handle different receipt types
    if (receipt.receiptType === 'commitment') {
      // COMMITMENT RECEIPT: No services
      const commitmentFeePaid = req.body.commitmentFeePaid !== undefined
          ? req.body.commitmentFeePaid
          : receipt.commitmentFeePaid || 0;

      const totalMovingAmount = req.body.totalMovingAmount !== undefined
          ? req.body.totalMovingAmount
          : receipt.totalMovingAmount || 0;

      req.body.services = []; // No services for commitment receipts
      req.body.commitmentFeePaid = commitmentFeePaid;
      req.body.totalMovingAmount = totalMovingAmount;

      if (!req.body.payment) req.body.payment = {};
      req.body.payment.totalAmount = totalMovingAmount;
      req.body.payment.amountPaid = commitmentFeePaid;
      req.body.payment.balance = totalMovingAmount - commitmentFeePaid;
    } else if (receipt.receiptType === 'final') {
      // FINAL RECEIPT: No services
      const commitmentFeePaid = req.body.commitmentFeePaid !== undefined
          ? req.body.commitmentFeePaid
          : receipt.commitmentFeePaid || 0;

      const finalPaymentReceived = req.body.finalPaymentReceived !== undefined
          ? req.body.finalPaymentReceived
          : receipt.finalPaymentReceived || 0;

      const grandTotal = commitmentFeePaid + finalPaymentReceived;

      req.body.services = []; // No services for final receipts
      req.body.commitmentFeePaid = commitmentFeePaid;
      req.body.finalPaymentReceived = finalPaymentReceived;

      if (!req.body.payment) req.body.payment = {};
      req.body.payment.totalAmount = grandTotal;
      req.body.payment.amountPaid = grandTotal;
      req.body.payment.balance = 0;
    } else if (receipt.receiptType === 'one_time') {
      // ONE TIME PAYMENT RECEIPT: No services
      const totalMovingAmount = req.body.totalMovingAmount !== undefined
          ? req.body.totalMovingAmount
          : receipt.totalMovingAmount || 0;

      req.body.services = []; // No services for one-time receipts
      req.body.totalMovingAmount = totalMovingAmount;

      if (!req.body.payment) req.body.payment = {};
      req.body.payment.totalAmount = totalMovingAmount;
      req.body.payment.amountPaid = totalMovingAmount;
      req.body.payment.balance = 0;
    } else if (req.body.services) {
      // Calculate service totals for other receipt types
      req.body.services = req.body.services.map(service => ({
        ...service,
        quantity: service.quantity || 1,
        total: (service.quantity || 1) * service.amount
      }));

      // Recalculate total amount
      const newTotalAmount = req.body.services.reduce(
        (sum, service) => sum + service.total,
        0
      );
      if (!req.body.payment) req.body.payment = {};
      req.body.payment.totalAmount = newTotalAmount;
      req.body.payment.balance =
        newTotalAmount - (receipt.payment.amountPaid || 0);
    }

    // Set edit tracking for versioning
    receipt._editedBy = req.user._id;

    // Update receipt
    Object.assign(receipt, req.body);

    await receipt.save();

    // Populate updated receipt
    await receipt.populate([
      { path: 'createdBy', select: 'fullName email' },
      { path: 'quotationId', select: 'quotationNumber type' }
    ]);

    ApiResponse.success(res, { receipt }, 'Receipt updated successfully');
  } catch (error) {
    console.error('Update receipt error:', error);

    if (error.name === 'ValidationError') {
      return ApiResponse.validationError(res, Object.values(error.errors));
    }

    ApiResponse.error(res, 'Failed to update receipt', 500);
  }
};

/**
 * Delete receipt (Admin only)
 */
const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return ApiResponse.error(res, 'Access denied. Admin role required', 403);
    }

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // If receipt was created from quotation, revert quotation status
    if (receipt.quotationId) {
      const quotation = await Quotation.findById(receipt.quotationId);
      if (quotation && quotation.validity.status === 'converted') {
        quotation.validity.status = 'active';
        quotation.convertedToReceipt = undefined;
        await quotation.save();
      }
    }

    await Receipt.findByIdAndDelete(id);

    ApiResponse.success(
      res,
      { receiptNumber: receipt.receiptNumber },
      'Receipt deleted successfully'
    );
  } catch (error) {
    console.error('Delete receipt error:', error);
    ApiResponse.error(res, 'Failed to delete receipt', 500);
  }
};

/**
 * Add payment to receipt
 */
const addPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, reference, notes } = req.body;

    if (!amount || !method) {
      return ApiResponse.error(
        res,
        'Amount and payment method are required',
        400
      );
    }

    if (amount <= 0) {
      return ApiResponse.error(res, 'Payment amount must be positive', 400);
    }

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    if (receipt.payment.status === 'paid') {
      return ApiResponse.error(res, 'Receipt is already fully paid', 400);
    }

    // Calculate remaining balance with proper rounding to avoid floating point issues
    const remainingBalance =
      Math.round(
        (receipt.payment.totalAmount - receipt.payment.amountPaid) * 100
      ) / 100;

    // Round the payment amount as well for comparison
    const roundedAmount = Math.round(amount * 100) / 100;

    // Allow a small tolerance for rounding differences (0.01)
    if (roundedAmount > remainingBalance + 0.01) {
      return ApiResponse.error(
        res,
        `Payment amount cannot exceed remaining balance of ${remainingBalance}`,
        400
      );
    }

    const paymentData = {
      amount,
      method,
      reference: reference || '',
      notes: notes || '',
      receivedBy: req.user._id
    };

    await receipt.addPayment(paymentData);

    // Populate updated receipt
    await receipt.populate([
      { path: 'createdBy', select: 'fullName email' },
      { path: 'payment.paymentHistory.receivedBy', select: 'fullName' }
    ]);

    ApiResponse.success(
      res,
      {
        receipt: {
          receiptNumber: receipt.receiptNumber,
          payment: receipt.payment
        }
      },
      'Payment added successfully'
    );
  } catch (error) {
    console.error('Add payment error:', error);
    ApiResponse.error(res, 'Failed to add payment', 500);
  }
};

/**
 * Get receipt statistics
 */
const getReceiptStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let dateFilter = {};
    const now = new Date();

    switch (period) {
      case 'week':
        dateFilter = {
          $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        };
        break;
      case 'month':
        dateFilter = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
        break;
      case 'year':
        dateFilter = { $gte: new Date(now.getFullYear(), 0, 1) };
        break;
      default:
        dateFilter = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    }

    // Base filter for user role
    const baseFilter =
      req.user.role === 'admin' ? {} : { createdBy: req.user._id };

    const [totalStats, periodStats, typeStats, statusStats, overdueCount] =
      await Promise.all([
        // Total counts
        Receipt.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalValue: { $sum: '$payment.totalAmount' },
              totalPaid: { $sum: '$payment.amountPaid' },
              totalBalance: { $sum: '$payment.balance' }
            }
          }
        ]),

        // Period-specific stats
        Receipt.aggregate([
          { $match: { ...baseFilter, createdAt: dateFilter } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              value: { $sum: '$payment.totalAmount' },
              paid: { $sum: '$payment.amountPaid' }
            }
          }
        ]),

        // By type
        Receipt.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: '$receiptType',
              count: { $sum: 1 },
              value: { $sum: '$payment.totalAmount' }
            }
          }
        ]),

        // By payment status
        Receipt.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: '$payment.status',
              count: { $sum: 1 }
            }
          }
        ]),

        // Overdue count
        Receipt.countDocuments({
          ...baseFilter,
          'payment.dueDate': { $lt: now },
          'payment.status': { $in: ['pending', 'partial'] }
        })
      ]);

    const stats = {
      total: totalStats[0]?.total || 0,
      totalValue: totalStats[0]?.totalValue || 0,
      totalPaid: totalStats[0]?.totalPaid || 0,
      totalBalance: totalStats[0]?.totalBalance || 0,
      overdue: overdueCount,
      period: {
        count: periodStats[0]?.count || 0,
        value: periodStats[0]?.value || 0,
        paid: periodStats[0]?.paid || 0
      },
      byType: typeStats.reduce((acc, stat) => {
        acc[stat._id] = stat;
        return acc;
      }, {}),
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    ApiResponse.success(
      res,
      { stats },
      'Receipt statistics retrieved successfully'
    );
  } catch (error) {
    console.error('Get receipt stats error:', error);
    ApiResponse.error(res, 'Failed to retrieve receipt statistics', 500);
  }
};

/**
 * Generate and download receipt PDF
 */
const generateReceiptPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const receipt = await Receipt.findById(id)
      .populate('createdBy', 'fullName email phonePrimary')
      .populate('quotationId', 'quotationNumber type')
      .populate('payment.paymentHistory.receivedBy', 'fullName');

    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    const pdfResult = await pdfService.generateAndUploadReceiptPDF(receipt);

    // Return Cloudinary URL for frontend to handle
    ApiResponse.success(res, 'PDF generated successfully', {
      pdfUrl: pdfResult.cloudinaryUrl,
      fileName: pdfResult.fileName,
      receiptNumber: receipt.receiptNumber
    });
  } catch (error) {
    console.error('Generate receipt PDF error:', error);
    ApiResponse.error(res, 'Failed to generate PDF', 500);
  }
};

/**
 * Send receipt PDF via email
 */
const sendReceiptPDF = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    const { id } = req.params;
    const { recipientEmail, message } = req.body;

    const receipt = await Receipt.findById(id)
      .populate('createdBy', 'fullName email phonePrimary')
      .populate('quotationId', 'quotationNumber type')
      .populate('payment.paymentHistory.receivedBy', 'fullName');

    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    const pdfResult = await pdfService.generateAndUploadReceiptPDF(receipt);
    const pdfBuffer = pdfResult.pdfBuffer;

    const emailService = require('../services/email.service');
    await emailService.sendReceiptEmail({
      to: recipientEmail,
      receipt,
      sender: req.user,
      pdfBuffer,
      customMessage: message
    });

    ApiResponse.success(
      res,
      {
        receiptNumber: receipt.receiptNumber,
        sentTo: recipientEmail
      },
      'Receipt PDF sent successfully'
    );
  } catch (error) {
    console.error('Send receipt PDF error:', error);
    ApiResponse.error(res, 'Failed to send receipt PDF', 500);
  }
};

/**
 * Download receipt PDF directly (streams the PDF file)
 */
const downloadReceiptPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const receipt = await Receipt.findById(id).populate(
      'createdBy',
      'fullName email phonePrimary'
    );

    if (!receipt) {
      return ApiResponse.error(res, 'Receipt not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      receipt.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    const pdfService = require('../services/pdf.service');
    // Generate PDF buffer directly without uploading to Cloudinary
    const pdfBuffer = await pdfService.generateReceiptPDF(receipt);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt_${receipt.receiptNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Stream the PDF buffer directly to user
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Download receipt PDF error:', error);
    ApiResponse.error(res, 'Failed to download PDF', 500);
  }
};

/**
 * Bulk delete receipts
 */
const bulkDeleteReceipts = async (req, res) => {
  try {
    const { receiptIds } = req.body;

    if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return ApiResponse.error(
        res,
        'Receipt IDs are required and must be an array',
        400
      );
    }

    // Only admins can bulk delete
    if (req.user.role !== 'admin') {
      return ApiResponse.error(
        res,
        'Access denied. Admin privileges required.',
        403
      );
    }

    // Find receipts to verify they exist
    const receipts = await Receipt.find({ _id: { $in: receiptIds } });

    if (receipts.length === 0) {
      return ApiResponse.error(
        res,
        'No receipts found with the provided IDs',
        404
      );
    }

    // Delete the receipts
    const deleteResult = await Receipt.deleteMany({ _id: { $in: receiptIds } });

    ApiResponse.success(
      res,
      {
        deletedCount: deleteResult.deletedCount,
        requestedCount: receiptIds.length
      },
      `Successfully deleted ${deleteResult.deletedCount} receipt(s)`
    );
  } catch (error) {
    console.error('Bulk delete receipts error:', error);
    ApiResponse.error(res, 'Failed to delete receipts', 500);
  }
};

/**
 * Get bulk download receipts info for frontend to download individually
 */
const bulkDownloadReceipts = async (req, res) => {
  try {
    const { receiptIds } = req.body;

    if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return ApiResponse.error(
        res,
        'Receipt IDs are required and must be an array',
        400
      );
    }

    // Build filter for user permissions
    const filter = { _id: { $in: receiptIds } };
    if (req.user.role !== 'admin') {
      filter.createdBy = req.user._id;
    }

    // Find receipts with user permission check
    const receipts = await Receipt.find(filter, 'receiptNumber _id').sort({
      createdAt: -1
    });

    if (receipts.length === 0) {
      return ApiResponse.error(res, 'No receipts found or access denied', 404);
    }

    // Return receipt info for frontend to download individually
    const downloadInfo = receipts.map(receipt => ({
      id: receipt._id,
      receiptNumber: receipt.receiptNumber,
      downloadUrl: `/api/receipts/${receipt._id}/download`
    }));

    ApiResponse.success(
      res,
      {
        receipts: downloadInfo,
        count: receipts.length
      },
      `Found ${receipts.length} receipt(s) for bulk download`
    );
  } catch (error) {
    console.error('Bulk download receipts error:', error);
    ApiResponse.error(res, 'Failed to prepare bulk download', 500);
  }
};

module.exports = {
  getReceipts,
  getReceiptById,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  addPayment,
  getReceiptStats,
  generateReceiptPDF,
  downloadReceiptPDF,
  sendReceiptPDF,
  bulkDeleteReceipts,
  bulkDownloadReceipts
};
