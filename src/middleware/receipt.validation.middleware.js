/**
 * Receipt Validation Middleware
 */

const { body } = require('express-validator');

const receiptValidation = [
  body('receiptType')
    .isIn(['box', 'commitment', 'final', 'one_time'])
    .withMessage('Receipt type must be box, commitment, final, or one_time'),

  body('client.name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),

  body('client.phone')
    .matches(/^[+]?[\d\s\-()]{10,}$/)
    .withMessage('Please provide a valid phone number'),

  body('client.email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),

  body('client.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters'),

  body('locations.from')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Pickup location cannot exceed 300 characters'),

  body('locations.to')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Destination location cannot exceed 300 characters'),

  body('locations.movingDate').optional().isISO8601().toDate(),

  body('services')
    .isArray({ min: 1 })
    .withMessage('At least one service is required'),

  body('services.*.description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Service description must be between 1 and 500 characters'),

  body('services.*.amount')
    .isFloat({ min: 0 })
    .withMessage('Service amount cannot be negative'),

  body('services.*.quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),

  body('payment.currency')
    .isIn(['UGX', 'USD'])
    .withMessage('Currency must be UGX or USD'),

  body('payment.method')
    .optional()
    .isIn(['cash', 'bank_transfer', 'mobile_money'])
    .withMessage('Payment method must be cash, bank_transfer, or mobile_money'),

  body('payment.dueDate').optional().isISO8601().toDate(),

  body('commitmentFee.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Commitment fee cannot be negative'),

  body('commitmentFee.paidDate').optional().isISO8601().toDate(),

  body('signatures.receivedBy')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Received by name cannot exceed 100 characters'),

  body('signatures.receivedByTitle')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Title cannot exceed 50 characters'),

  body('signatures.clientName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Client name cannot exceed 100 characters'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

const createFromQuotationValidation = [
  body('receiptType')
    .isIn(['commitment', 'final', 'one_time'])
    .withMessage('Receipt type must be commitment, final, or one_time'),
  body('payment.method')
    .optional()
    .isIn(['cash', 'bank_transfer', 'mobile_money'])
    .withMessage('Payment method must be cash, bank_transfer, or mobile_money'),
  body('client.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters')
];

const addPaymentValidation = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Payment amount must be greater than 0'),
  body('method')
    .isIn(['cash', 'bank_transfer', 'mobile_money'])
    .withMessage('Payment method must be cash, bank_transfer, or mobile_money'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference cannot exceed 100 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Notes cannot exceed 200 characters')
];

const receiptEmailValidation = [
  body('recipientEmail')
    .isEmail()
    .withMessage('Valid recipient email is required'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters')
];

module.exports = {
  receiptValidation,
  createFromQuotationValidation,
  addPaymentValidation,
  receiptEmailValidation
};
