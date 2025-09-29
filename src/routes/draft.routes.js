const express = require('express');
const router = express.Router();
const draftController = require('../controllers/draft.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { body, param, validationResult } = require('express-validator');

// Validation middleware for draft operations
const validateDraftType = [
  param('type')
    .isIn(['quotation-create', 'receipt-create'])
    .withMessage('Invalid draft type. Must be quotation-create or receipt-create'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateDraftSave = [
  body('type')
    .isIn(['quotation-create', 'receipt-create'])
    .withMessage('Invalid draft type. Must be quotation-create or receipt-create'),
  body('data')
    .isObject()
    .withMessage('Draft data must be an object'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    next();
  }
];

// All draft routes require authentication
router.use(authenticate);

// Get all drafts for user (list view)
router.get('/', draftController.getUserDrafts);

// Save or update a draft
router.post('/', validateDraftSave, draftController.saveDraft);

// Get draft by type
router.get('/:type', validateDraftType, draftController.getDraftByType);

// Delete draft by type
router.delete('/:type', validateDraftType, draftController.deleteDraftByType);

// Delete all user drafts
router.delete('/', draftController.deleteAllUserDrafts);

module.exports = router;