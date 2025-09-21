// CORS Configuration Module
const getAllowedOrigins = () => {
  const origins = [];

  // Always allow localhost for development
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:5173', 'http://localhost:3000');
  }

  // Add production origins
  if (process.env.NODE_ENV === 'production') {
    origins.push(
      'https://acesmovers.netlify.app',
      'https://acesmovers.netlify.com'
    );
  }

  // Add CLIENT_URL if specified
  if (process.env.CLIENT_URL) {
    origins.push(process.env.CLIENT_URL);
  }

  // Parse ALLOWED_ORIGINS from env if specified
  if (process.env.ALLOWED_ORIGINS) {
    const additionalOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    origins.push(...additionalOrigins);
  }

  // Remove duplicates
  return [...new Set(origins)];
};

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, postman, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = getAllowedOrigins();

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from origin: ${origin}`);
      console.log('Allowed origins:', allowedOrigins);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Auth-Token'
  ],
  maxAge: process.env.NODE_ENV === 'production' ? 86400 : 3600, // 24 hours in production, 1 hour in dev
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

module.exports = { corsOptions, getAllowedOrigins };