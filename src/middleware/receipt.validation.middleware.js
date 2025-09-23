/**
 * Receipt Validation Middleware
 */

const { body } = require('express-validator');

const receiptValidation = [
  body('receiptType')
    .isIn(['item', 'commitment', 'final', 'one_time'])
    .withMessage('Receipt type must be item, commitment, final, or one_time'),

  body('moveType')
    .optional()
    .isIn(['international', 'residential', 'office'])
    .withMessage('Move type must be international, residential, or office')
    .custom((value, { req }) => {
      // Move type is required for all receipts except item receipts
      if (req.body.receiptType !== 'item' && !value) {
        throw new Error('Move type is required for this receipt type');
      }
      return true;
    }),

  // Custom validation for services based on receipt type
  body('services').custom((value, { req }) => {
    // For commitment, final, and one_time receipts, services are generated automatically
    if (['commitment', 'final', 'one_time'].includes(req.body.receiptType)) {
      return true;
    }
    // For item receipts, services are required
    if (req.body.receiptType === 'item') {
      if (!value || !Array.isArray(value) || value.length === 0) {
        throw new Error('At least one service is required for item receipts');
      }
    }
    return true;
  }),

  body('client.name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),

  body('client.phone')
    .matches(/^[+]?[\d\s\-()]{10,}$/)
    .withMessage('Please provide a valid phone number'),

  body('client.email')
    .optional({ nullable: true, checkFalsy: true })
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
    .withMessage('Pickup location cannot exceed 300 characters')
    .custom((value, { req }) => {
      // Locations are required for commitment, final, and one_time receipts
      if (
        ['commitment', 'final', 'one_time'].includes(req.body.receiptType) &&
        !value
      ) {
        throw new Error('Pickup location is required for this receipt type');
      }
      return true;
    }),

  body('locations.to')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Destination location cannot exceed 300 characters')
    .custom((value, { req }) => {
      // Locations are required for commitment, final, and one_time receipts
      if (
        ['commitment', 'final', 'one_time'].includes(req.body.receiptType) &&
        !value
      ) {
        throw new Error(
          'Destination location is required for this receipt type'
        );
      }
      return true;
    }),

  body('locations.movingDate').optional().isISO8601().toDate(),

  body('services.*.description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Service description must be between 1 and 500 characters'),

  body('services.*.amount')
    .isFloat({ min: 0 })
    .withMessage('Service amount cannot be negative'),

  body('services.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),

  body('services.*.total')
    .isFloat({ min: 0 })
    .withMessage('Service total cannot be negative'),

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
    .withMessage('Notes cannot exceed 1000 characters'),

  // Receipt type specific fields
  body('commitmentFeePaid')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Commitment fee must be positive')
    .custom((value, { req }) => {
      if (
        (req.body.receiptType === 'commitment' ||
          req.body.receiptType === 'final') &&
        value === undefined
      ) {
        throw new Error('Commitment fee is required for this receipt type');
      }
      return true;
    }),

  body('totalMovingAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total moving amount must be positive')
    .custom((value, { req }) => {
      if (
        ['commitment', 'one_time'].includes(req.body.receiptType) &&
        value === undefined
      ) {
        throw new Error(
          'Total moving amount is required for this receipt type'
        );
      }
      return true;
    }),

  body('finalPaymentReceived')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Final payment must be positive')
    .custom((value, { req }) => {
      if (req.body.receiptType === 'final' && value === undefined) {
        throw new Error(
          'Final payment received is required for final receipts'
        );
      }
      return true;
    })
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
  addPaymentValidation,
  receiptEmailValidation
};
