/**
 * Receipt Routes
 * Handles all receipt-related endpoints
 */

const express = require('express');
const router = express.Router();

const {
  getReceipts,
  getReceiptById,
  createReceipt,
  createFromQuotation,
  updateReceipt,
  deleteReceipt,
  addPayment,
  getReceiptStats,
  generateReceiptPDF,
  downloadReceiptPDF,
  sendReceiptPDF,
  bulkDeleteReceipts,
  bulkDownloadReceipts
} = require('../controllers/receipt.controller');

const { authenticate } = require('../middleware/auth.middleware');
const {
  validateProfileCompletion
} = require('../middleware/validation.middleware');
const {
  receiptValidation,
  createFromQuotationValidation,
  addPaymentValidation,
  receiptEmailValidation
} = require('../middleware/receipt.validation.middleware');

// Apply authentication to all routes
router.use(authenticate);

// Apply profile completion check to document creation/modification routes
const requireCompleteProfile = [authenticate, validateProfileCompletion];

/**
 * @route GET /api/receipts
 * @desc Get all receipts with filtering and pagination
 * @access Private
 * @query page, limit, receiptType, paymentStatus, search, sortBy, sortOrder, startDate, endDate, createdBy, overdue
 */
router.get('/', getReceipts);

/**
 * @route GET /api/receipts/stats
 * @desc Get receipt statistics
 * @access Private
 * @query period (week|month|year)
 */
router.get('/stats', getReceiptStats);

/**
 * @route GET /api/receipts/:id
 * @desc Get single receipt by ID
 * @access Private
 */
router.get('/:id', getReceiptById);

/**
 * @route POST /api/receipts
 * @desc Create new receipt
 * @access Private (Profile must be complete)
 */
router.post('/', requireCompleteProfile, receiptValidation, createReceipt);

/**
 * @route POST /api/receipts/from-quotation/:quotationId
 * @desc Create receipt from quotation
 * @access Private (Profile must be complete)
 */
router.post(
  '/from-quotation/:quotationId',
  requireCompleteProfile,
  createFromQuotationValidation,
  createFromQuotation
);

/**
 * @route PUT /api/receipts/:id
 * @desc Update receipt
 * @access Private (Creator or Admin)
 */
router.put('/:id', requireCompleteProfile, receiptValidation, updateReceipt);

/**
 * @route DELETE /api/receipts/:id
 * @desc Delete receipt
 * @access Admin only
 */
router.delete('/:id', deleteReceipt);

/**
 * @route POST /api/receipts/:id/payments
 * @desc Add payment to receipt
 * @access Private (Creator or Admin)
 */
router.post('/:id/payments', addPaymentValidation, addPayment);

/**
 * @route GET /api/receipts/:id/pdf
 * @desc Generate receipt PDF and get Cloudinary URL
 * @access Private (Creator or Admin)
 */
router.get('/:id/pdf', generateReceiptPDF);

/**
 * @route GET /api/receipts/:id/download
 * @desc Download receipt PDF directly (streams PDF file)
 * @access Private (Creator or Admin)
 */
router.get('/:id/download', downloadReceiptPDF);

/**
 * @route POST /api/receipts/:id/send
 * @desc Send receipt PDF via email
 * @access Private (Creator or Admin)
 */
router.post('/:id/send', receiptEmailValidation, sendReceiptPDF);

/**
 * @route POST /api/receipts/bulk/delete
 * @desc Bulk delete receipts
 * @access Admin only
 */
router.post('/bulk/delete', bulkDeleteReceipts);

/**
 * @route POST /api/receipts/bulk/download
 * @desc Bulk download receipts as merged PDF
 * @access Private (Creator or Admin)
 */
router.post('/bulk/download', bulkDownloadReceipts);

module.exports = router;
