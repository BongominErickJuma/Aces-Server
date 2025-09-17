/**
 * Signature Routes
 * Handles signature-related API endpoints
 */

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth.middleware');
const {
  validateSignature
} = require('../middleware/signature.validation.middleware');
const {
  saveSignature,
  uploadSignature,
  getSignature,
  deleteSignature
} = require('../controllers/signature.controller');

const router = express.Router();

// Configure multer for signature uploads
const upload = multer({
  dest: 'public/temp/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for signatures'), false);
    }
  }
});

// All signature routes require authentication
router.use(authenticate);

// POST /api/signatures/save - Save canvas signature
router.post('/save', validateSignature, saveSignature);

// POST /api/signatures/upload - Upload signature image
router.post('/upload', upload.single('signature'), uploadSignature);

// GET /api/signatures/me - Get current user's signature
router.get('/me', getSignature);

// DELETE /api/signatures/me - Delete current user's signature
router.delete('/me', deleteSignature);

module.exports = router;
