/**
 * Quotation Routes
 * Handles all quotation-related endpoints
 */

const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/quotation.controller');

const { authenticate } = require('../middleware/auth.middleware');
const {
  validateProfileCompletion
} = require('../middleware/validation.middleware');
const {
  quotationValidation,
  quotationEmailValidation,
  extendValidityValidation
} = require('../middleware/quotation.validation.middleware');

// Apply authentication to all routes
router.use(authenticate);

// Apply profile completion check to document creation/modification routes
const requireCompleteProfile = [authenticate, validateProfileCompletion];

/**
 * @route POST /api/quotations/bulk/delete
 * @desc Bulk delete quotations
 * @access Admin only
 */
router.post('/bulk/delete', bulkDeleteQuotations);

/**
 * @route POST /api/quotations/bulk/download
 * @desc Get bulk download quotations info
 * @access Private (Creator or Admin for each quotation)
 */
router.post('/bulk/download', bulkDownloadQuotations);

/**
 * @route GET /api/quotations
 * @desc Get all quotations with filtering and pagination
 * @access Private
 * @query page, limit, type, status, search, sortBy, sortOrder, startDate, endDate, createdBy
 */
router.get('/', getQuotations);

/**
 * @route GET /api/quotations/stats
 * @desc Get quotation statistics
 * @access Private
 * @query period (week|month|year)
 */
router.get('/stats', getQuotationStats);

/**
 * @route GET /api/quotations/:id
 * @desc Get single quotation by ID
 * @access Private
 */
router.get('/:id', getQuotationById);

/**
 * @route POST /api/quotations
 * @desc Create new quotation
 * @access Private (Profile must be complete)
 */
router.post('/', requireCompleteProfile, quotationValidation, createQuotation);

/**
 * @route PUT /api/quotations/:id
 * @desc Update quotation
 * @access Private (Creator or Admin)
 */
router.put(
  '/:id',
  requireCompleteProfile,
  quotationValidation,
  updateQuotation
);

/**
 * @route DELETE /api/quotations/:id
 * @desc Delete quotation
 * @access Admin only
 */
router.delete('/:id', deleteQuotation);

/**
 * @route PUT /api/quotations/:id/extend
 * @desc Extend quotation validity
 * @access Private (Creator or Admin)
 */
router.put('/:id/extend', extendValidityValidation, extendValidity);

/**
 * @route GET /api/quotations/:id/pdf
 * @desc Generate quotation PDF and get Cloudinary URL
 * @access Private (Creator or Admin)
 */
router.get('/:id/pdf', generateQuotationPDF);

/**
 * @route GET /api/quotations/:id/download
 * @desc Download quotation PDF directly (streams PDF file)
 * @access Private (Creator or Admin)
 */
router.get('/:id/download', downloadQuotationPDF);

/**
 * @route POST /api/quotations/:id/send
 * @desc Send quotation PDF via email
 * @access Private (Creator or Admin)
 */
router.post('/:id/send', quotationEmailValidation, sendQuotationPDF);

module.exports = router;
