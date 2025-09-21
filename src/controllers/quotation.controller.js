/**
 * Quotation Controller
 * Handles CRUD operations for quotations
 */

const { Quotation } = require('../models');
const ApiResponse = require('../utils/response');
const { validationResult } = require('express-validator');
const pdfService = require('../services/pdf.service');

/**
 * Get all quotations with filtering, sorting, and pagination
 */
const getQuotations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
      createdBy
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

    if (type) filter.type = type;
    if (status) filter['validity.status'] = status;

    // Date range filtering
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Text search
    if (search) {
      // First, try to find users matching the search term
      const User = require('../models/User.model');
      const matchingUsers = await User.find({
        fullName: { $regex: search, $options: 'i' }
      }).select('_id');
      const userIds = matchingUsers.map(user => user._id);

      filter.$or = [
        { quotationNumber: { $regex: search, $options: 'i' } },
        { 'client.name': { $regex: search, $options: 'i' } },
        { 'client.company': { $regex: search, $options: 'i' } },
        { createdBy: { $in: userIds } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries in parallel
    const [quotations, totalCount] = await Promise.all([
      Quotation.find(filter)
        .populate('createdBy', 'fullName email')
        .populate('convertedToReceipt.receiptId', 'receiptNumber')
        .populate('convertedToReceipt.convertedBy', 'fullName')
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Quotation.countDocuments(filter)
    ]);

    ApiResponse.paginated(
      res,
      quotations,
      {
        page: pageNumber,
        limit: limitNumber,
        total: totalCount
      },
      'Quotations retrieved successfully'
    );
  } catch (error) {
    console.error('Get quotations error:', error);
    ApiResponse.error(res, 'Failed to retrieve quotations', 500);
  }
};

/**
 * Get single quotation by ID
 */
const getQuotationById = async (req, res) => {
  try {
    const { id } = req.params;

    const quotation = await Quotation.findById(id)
      .populate('createdBy', 'fullName email phonePrimary')
      .populate(
        'convertedToReceipt.receiptId',
        'receiptNumber receiptType createdAt'
      )
      .populate('convertedToReceipt.convertedBy', 'fullName');

    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    ApiResponse.success(res, { quotation }, 'Quotation retrieved successfully');
  } catch (error) {
    console.error('Get quotation by ID error:', error);
    ApiResponse.error(res, 'Failed to retrieve quotation', 500);
  }
};

/**
 * Create new quotation
 */
const createQuotation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    // Validate office move requirements
    if (req.body.type === 'office' && !req.body.client.company) {
      return ApiResponse.error(
        res,
        'Company name is required for office moves',
        400
      );
    }

    // Generate quotation number
    const quotationNumber = await Quotation.generateQuotationNumber();

    // Calculate service totals
    const services = req.body.services.map(service => ({
      ...service,
      total: service.quantity * service.unitPrice
    }));

    // Create quotation data
    const quotationData = {
      ...req.body,
      quotationNumber,
      services,
      createdBy: req.user._id
    };

    const quotation = new Quotation(quotationData);
    await quotation.save();

    // Populate created quotation
    await quotation.populate('createdBy', 'fullName email');

    // Trigger notification via notification service
    try {
      const notificationService = require('../services/notification.service');
      if (!notificationService.isMonitoring) {
        // If change streams aren't working, manually trigger notification
        await notificationService.triggerDocumentNotification(
          'quotation',
          quotation._id,
          'insert'
        );
      }
    } catch (notifError) {
      console.error('Failed to trigger notification:', notifError);
    }

    ApiResponse.success(
      res,
      { quotation },
      'Quotation created successfully',
      201
    );
  } catch (error) {
    console.error('Create quotation error:', error);

    if (error.name === 'ValidationError') {
      return ApiResponse.validationError(res, Object.values(error.errors));
    }

    ApiResponse.error(res, 'Failed to create quotation', 500);
  }
};

/**
 * Update quotation
 */
const updateQuotation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    const { id } = req.params;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    // Prevent updating converted quotations
    if (quotation.validity.status === 'converted') {
      return ApiResponse.error(res, 'Cannot update converted quotations', 400);
    }

    // Validate office move requirements
    const updatedType = req.body.type || quotation.type;
    const updatedCompany = req.body.client?.company || quotation.client.company;

    if (updatedType === 'office' && !updatedCompany) {
      return ApiResponse.error(
        res,
        'Company name is required for office moves',
        400
      );
    }

    // Calculate service totals if services are being updated
    if (req.body.services) {
      req.body.services = req.body.services.map(service => ({
        ...service,
        total: service.quantity * service.unitPrice
      }));
    }

    // Capture field changes for notification
    const changes = [];
    const oldQuotation = quotation.toObject(); // Get current state

    // Helper function to format values for display
    const formatValue = value => {
      if (value === null || value === undefined) return 'Not set';
      if (typeof value === 'object' && value instanceof Date) {
        return value.toLocaleDateString();
      }
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }
      return value.toString();
    };

    // Helper function to get nested property
    const getNestedValue = (obj, path) => {
      return path
        .split('.')
        .reduce((current, key) => current && current[key], obj);
    };

    // Check for changes in all updatable fields
    const fieldsToCheck = [
      { path: 'type', label: 'Move Type' },
      { path: 'client.name', label: 'Client Name' },
      { path: 'client.phone', label: 'Client Phone' },
      { path: 'client.email', label: 'Client Email' },
      { path: 'client.company', label: 'Company Name' },
      { path: 'locations.from', label: 'Move From Location' },
      { path: 'locations.to', label: 'Move To Location' },
      { path: 'locations.movingDate', label: 'Moving Date' },
      { path: 'pricing.currency', label: 'Currency' },
      { path: 'pricing.discount', label: 'Discount' },
      { path: 'pricing.taxRate', label: 'Tax Rate' },
      { path: 'termsAndConditions', label: 'Terms and Conditions' },
      { path: 'notes', label: 'Notes' }
    ];

    for (const field of fieldsToCheck) {
      const oldValue = getNestedValue(oldQuotation, field.path);
      const newValue = getNestedValue(req.body, field.path);

      // Only track changes if the field is explicitly provided in the request body
      // and the value is actually different from the current value
      if (
        newValue !== undefined &&
        JSON.stringify(oldValue) !== JSON.stringify(newValue) &&
        formatValue(oldValue) !== formatValue(newValue) // Additional check for formatted values
      ) {
        changes.push({
          field: field.label,
          oldValue: formatValue(oldValue),
          newValue: formatValue(newValue)
        });
      }
    }

    // Special handling for services array
    if (req.body.services) {
      const oldServices = oldQuotation.services || [];
      const newServices = req.body.services || [];

      if (JSON.stringify(oldServices) !== JSON.stringify(newServices)) {
        // For services, we'll show a general change message since individual service changes are complex
        changes.push({
          field: 'Services',
          oldValue: `${oldServices.length} service(s)`,
          newValue: `${newServices.length} service(s)`
        });
      }
    }

    // Update quotation
    Object.assign(quotation, req.body);
    quotation.version += 1;

    await quotation.save();

    // Populate updated quotation
    await quotation.populate('createdBy', 'fullName email');

    // Send notification to admins if there were changes
    if (changes.length > 0) {
      try {
        const User = require('../models/User.model');

        // Get all admin users
        const admins = await User.find({ role: 'admin', status: 'active' });
        const adminIds = admins.map(admin => admin._id);

        if (adminIds.length > 0) {
          // Use the Notification model directly to create the detailed notification
          const Notification = require('../models/Notification.model');
          await Notification.createDocumentNotificationWithDetails(
            'document_updated',
            'Quotation',
            quotation._id,
            quotation.quotationNumber,
            req.user._id, // actor (person who made the change)
            adminIds,
            changes
          );
        }
      } catch (notifError) {
        console.error(
          'Failed to send quotation update notification:',
          notifError
        );
        // Don't fail the request if notification fails
      }
    }

    ApiResponse.success(res, { quotation }, 'Quotation updated successfully');
  } catch (error) {
    console.error('Update quotation error:', error);

    if (error.name === 'ValidationError') {
      return ApiResponse.validationError(res, Object.values(error.errors));
    }

    ApiResponse.error(res, 'Failed to update quotation', 500);
  }
};

/**
 * Delete quotation (Admin only)
 */
const deleteQuotation = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return ApiResponse.error(res, 'Access denied. Admin role required', 403);
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Prevent deleting converted quotations
    if (quotation.validity.status === 'converted') {
      return ApiResponse.error(res, 'Cannot delete converted quotations', 400);
    }

    await Quotation.findByIdAndDelete(id);

    // Send notification to all admin users about deletion
    try {
      const User = require('../models/User.model');

      // Get all admin users
      const admins = await User.find({ role: 'admin', status: 'active' });
      const adminIds = admins.map(admin => admin._id);

      if (adminIds.length > 0) {
        // Use the Notification model directly to create the deletion notification
        const Notification = require('../models/Notification.model');
        await Notification.createDocumentNotification(
          'document_deleted',
          'Quotation',
          id, // Use original ID since document is deleted
          quotation.quotationNumber,
          req.user._id, // actor (admin who deleted)
          adminIds
        );
      }
    } catch (notifError) {
      console.error(
        'Failed to send quotation delete notification:',
        notifError
      );
      // Don't fail the request if notification fails
    }

    ApiResponse.success(
      res,
      { quotationNumber: quotation.quotationNumber },
      'Quotation deleted successfully'
    );
  } catch (error) {
    console.error('Delete quotation error:', error);
    ApiResponse.error(res, 'Failed to delete quotation', 500);
  }
};

/**
 * Extend quotation validity
 */
const extendValidity = async (req, res) => {
  try {
    const { id } = req.params;
    const { days, reason } = req.body;

    if (!days || !reason) {
      return ApiResponse.error(res, 'Days and reason are required', 400);
    }

    if (days < 1 || days > 90) {
      return ApiResponse.error(res, 'Days must be between 1 and 90', 400);
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    if (quotation.validity.status === 'converted') {
      return ApiResponse.error(res, 'Cannot extend converted quotations', 400);
    }

    await quotation.extendValidity(days, reason, req.user.fullName);

    ApiResponse.success(
      res,
      {
        quotationNumber: quotation.quotationNumber,
        newValidUntil: quotation.validity.validUntil,
        remainingDays: quotation.remainingDays
      },
      'Quotation validity extended successfully'
    );
  } catch (error) {
    console.error('Extend validity error:', error);
    ApiResponse.error(res, 'Failed to extend quotation validity', 500);
  }
};

/**
 * Get quotation statistics
 */
const getQuotationStats = async (req, res) => {
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

    const [totalStats, periodStats, typeStats, statusStats] = await Promise.all(
      [
        // Total counts
        Quotation.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalValue: { $sum: '$pricing.totalAmount' }
            }
          }
        ]),

        // Period-specific stats
        Quotation.aggregate([
          { $match: { ...baseFilter, createdAt: dateFilter } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              value: { $sum: '$pricing.totalAmount' }
            }
          }
        ]),

        // By type
        Quotation.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              value: { $sum: '$pricing.totalAmount' }
            }
          }
        ]),

        // By status
        Quotation.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: '$validity.status',
              count: { $sum: 1 }
            }
          }
        ])
      ]
    );

    const stats = {
      total: totalStats[0]?.total || 0,
      totalValue: totalStats[0]?.totalValue || 0,
      period: {
        count: periodStats[0]?.count || 0,
        value: periodStats[0]?.value || 0
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
      'Quotation statistics retrieved successfully'
    );
  } catch (error) {
    console.error('Get quotation stats error:', error);
    ApiResponse.error(res, 'Failed to retrieve quotation statistics', 500);
  }
};

/**
 * Generate and download quotation PDF
 */
const generateQuotationPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const quotation = await Quotation.findById(id).populate(
      'createdBy',
      'fullName email phonePrimary'
    );

    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    const pdfResult = await pdfService.generateAndUploadQuotationPDF(quotation);

    // Return Cloudinary URL for frontend to handle
    ApiResponse.success(res, 'PDF generated successfully', {
      pdfUrl: pdfResult.cloudinaryUrl,
      fileName: pdfResult.fileName,
      quotationNumber: quotation.quotationNumber
    });
  } catch (error) {
    console.error('Generate quotation PDF error:', error);
    ApiResponse.error(res, 'Failed to generate PDF', 500);
  }
};

/**
 * Send quotation PDF via email
 */
const sendQuotationPDF = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, errors.array());
    }

    const { id } = req.params;
    const { recipientEmail, message } = req.body;

    const quotation = await Quotation.findById(id).populate(
      'createdBy',
      'fullName email phonePrimary'
    );

    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    const pdfResult = await pdfService.generateAndUploadQuotationPDF(quotation);
    const pdfBuffer = pdfResult.pdfBuffer;

    const emailService = require('../services/email.service');
    await emailService.sendQuotationEmail({
      to: recipientEmail,
      quotation,
      sender: req.user,
      pdfBuffer,
      customMessage: message
    });

    ApiResponse.success(
      res,
      {
        quotationNumber: quotation.quotationNumber,
        sentTo: recipientEmail
      },
      'Quotation PDF sent successfully'
    );
  } catch (error) {
    console.error('Send quotation PDF error:', error);
    ApiResponse.error(res, 'Failed to send quotation PDF', 500);
  }
};

/**
 * Download quotation PDF directly (streams the PDF file)
 */
const downloadQuotationPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const quotation = await Quotation.findById(id).populate(
      'createdBy',
      'fullName email phonePrimary'
    );

    if (!quotation) {
      return ApiResponse.error(res, 'Quotation not found', 404);
    }

    // Check permissions
    if (
      req.user.role !== 'admin' &&
      quotation.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return ApiResponse.error(res, 'Access denied', 403);
    }

    // Generate PDF buffer directly without uploading to Cloudinary
    const pdfBuffer = await pdfService.generateQuotationPDF(quotation);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quotation_${quotation.quotationNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Stream the PDF buffer directly to user
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Download quotation PDF error:', error);
    ApiResponse.error(res, 'Failed to download PDF', 500);
  }
};

/**
 * Bulk delete quotations
 */
const bulkDeleteQuotations = async (req, res) => {
  try {
    const { quotationIds } = req.body;
    if (
      !quotationIds ||
      !Array.isArray(quotationIds) ||
      quotationIds.length === 0
    ) {
      return ApiResponse.error(
        res,
        'Quotation IDs are required and must be an array',
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

    // Find quotations to verify they exist
    const quotations = await Quotation.find({ _id: { $in: quotationIds } });
    if (quotations.length === 0) {
      return ApiResponse.error(
        res,
        'No quotations found with the provided IDs',
        404
      );
    }

    // Delete the quotations
    const deleteResult = await Quotation.deleteMany({
      _id: { $in: quotationIds }
    });

    // Send individual notifications to all admin users for each deleted quotation
    if (deleteResult.deletedCount > 0) {
      try {
        const User = require('../models/User.model');

        // Get all admin users
        const admins = await User.find({ role: 'admin', status: 'active' });
        const adminIds = admins.map(admin => admin._id);

        if (adminIds.length > 0) {
          // Create individual notification for each deleted quotation
          const Notification = require('../models/Notification.model');

          for (const quotation of quotations) {
            await Notification.createDocumentNotification(
              'document_deleted',
              'Quotation',
              quotation._id, // Use the quotation ID
              quotation.quotationNumber,
              req.user._id, // actor (admin who deleted)
              adminIds
            );
          }
        }
      } catch (notifError) {
        console.error(
          'Failed to send quotation delete notifications:',
          notifError
        );
        // Don't fail the request if notification fails
      }
    }

    ApiResponse.success(
      res,
      {
        deletedCount: deleteResult.deletedCount,
        requestedCount: quotationIds.length
      },
      `Successfully deleted ${deleteResult.deletedCount} quotation(s)`
    );
  } catch (error) {
    console.error('Bulk delete quotations error:', error);
    ApiResponse.error(res, 'Failed to delete quotations', 500);
  }
};

/**
 * Get bulk download quotations info for frontend to download individually
 */
const bulkDownloadQuotations = async (req, res) => {
  try {
    const { quotationIds } = req.body;
    if (
      !quotationIds ||
      !Array.isArray(quotationIds) ||
      quotationIds.length === 0
    ) {
      return ApiResponse.error(
        res,
        'Quotation IDs are required and must be an array',
        400
      );
    }

    // Build filter for user permissions
    const filter = { _id: { $in: quotationIds } };
    if (req.user.role !== 'admin') {
      filter.createdBy = req.user._id;
    }

    // Find quotations with user permission check
    const quotations = await Quotation.find(filter, 'quotationNumber _id').sort(
      { createdAt: -1 }
    );
    if (quotations.length === 0) {
      return ApiResponse.error(
        res,
        'No quotations found or access denied',
        404
      );
    }

    // Return quotation info for frontend to download individually
    const downloadInfo = quotations.map(quotation => ({
      id: quotation._id,
      quotationNumber: quotation.quotationNumber,
      downloadUrl: `/api/quotations/${quotation._id}/download`
    }));

    ApiResponse.success(
      res,
      {
        quotations: downloadInfo,
        count: quotations.length
      },
      `Found ${quotations.length} quotation(s) for bulk download`
    );
  } catch (error) {
    console.error('Bulk download quotations error:', error);
    ApiResponse.error(res, 'Failed to prepare bulk download', 500);
  }
};

module.exports = {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  extendValidity,
  getQuotationStats,
  generateQuotationPDF,
  downloadQuotationPDF,
  sendQuotationPDF,
  bulkDeleteQuotations,
  bulkDownloadQuotations
};
