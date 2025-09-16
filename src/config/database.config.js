require('dotenv').config();
const mongoose = require('mongoose');

const DB = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
