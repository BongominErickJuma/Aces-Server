const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const connectDB = require('./config/database.config');
const notificationService = require('./services/notification.service');

// Initialize database connection
connectDB().then(() => {
  // Start notification monitoring after DB connection
  notificationService.startMonitoring();
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await notificationService.stopMonitoring();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  await notificationService.stopMonitoring();
  process.exit(0);
});
