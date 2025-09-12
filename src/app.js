const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// Import error handling middleware
const {
  errorHandlerWithLogging,
  handleNotFound
} = require('./middleware/errorHandler.middleware');
const ApiResponse = require('./utils/response');

// Import security middleware
const {
  securityHeaders,
  requestSizeLimiter,
  sanitizeInput
} = require('./middleware/security.middleware');

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Apply security headers
app.use(securityHeaders);

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  })
);

// Request size limiting
app.use(requestSizeLimiter);

// Input sanitization
app.use(sanitizeInput);

// General rate limiting
// app.use(generalLimiter); // Disabled for now

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser(process.env.COOKIE_SECRET));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoints
app.get('/', (req, res) => {
  ApiResponse.success(
    res,
    {
      service: 'Aces Movers API',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    'Aces Movers API Server Running'
  );
});

app.get('/api/health', (req, res) => {
  ApiResponse.success(
    res,
    {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    'API is healthy'
  );
});

// API Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const quotationRoutes = require('./routes/quotation.routes');
const receiptRoutes = require('./routes/receipt.routes');
const uploadRoutes = require('./routes/upload.routes');
const notificationRoutes = require('./routes/notification.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

// API Routes with specific rate limiting
// app.use('/api/auth', authLimiter, authRoutes); // Rate limiting disabled
// app.use('/api/quotations', createDocumentLimiter, quotationRoutes); // Rate limiting disabled
// app.use('/api/receipts', createDocumentLimiter, receiptRoutes); // Rate limiting disabled
// app.use('/api/uploads', uploadLimiter, uploadRoutes); // Rate limiting disabled
app.use('/api/auth', authRoutes); // Rate limiting disabled
app.use('/api/users', userRoutes);
app.use('/api/quotations', quotationRoutes); // Rate limiting disabled
app.use('/api/receipts', receiptRoutes); // Rate limiting disabled
app.use('/api/uploads', uploadRoutes); // Rate limiting disabled
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Handle unhandled routes (404)
app.all('*', handleNotFound);

// Global error handling middleware (must be last)
app.use(errorHandlerWithLogging);

module.exports = app;
