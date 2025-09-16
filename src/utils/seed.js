/**
 * Database Seeding Script
 * Creates initial admin user for testing
 */

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const User = require('../models/User.model');
const Quotation = require('../models/Quotation.model');
const Receipt = require('../models/Receipt.model');
const Counter = require('../models/Counter.model');
const connectDB = require('../config/database.config');

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Connect to MongoDB
    await connectDB();

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (existingAdmin) {
      console.log('🗑️ Clearing existing data to create fresh seed data...');
      await User.deleteMany({});
      await Quotation.deleteMany({});
      await Receipt.deleteMany({});
      await Counter.deleteMany({});
      console.log('✅ Database cleared successfully');
    }

    // Create default admin user
    const adminData = {
      email: 'admin@acesmovers.com',
      password: 'Admin123!', // This should be changed after first login
      fullName: 'Erick Bongomin',
      role: 'admin',
      status: 'active',
      phonePrimary: '+256700000000',
      phoneSecondary: '+256700000002',
      address: 'Aces Movers Head Office, Plot 123, Kampala Road, Kampala',
      emergencyContact: '+256700000001',
      signature: {
        type: 'canvas',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // Sample signature
        createdAt: new Date()
      },
      profileCompleted: true // Set to true for admin
    };

    const admin = new User(adminData);
    await admin.save();

    // Create test regular users with complete profiles
    const testUsers = [
      {
        email: 'manager@acesmovers.com',
        password: 'Manager123!',
        fullName: 'Sarah Nakato',
        role: 'user',
        status: 'active',
        phonePrimary: '+256701000001',
        phoneSecondary: '+256701000002',
        address: 'Plot 45, Ntinda Road, Kampala',
        emergencyContact: '+256701000003',
        signature: {
          type: 'upload',
          data: 'https://res.cloudinary.com/dvedpgxcz/image/upload/v1757960352/default_wiyefz.jpg',
          publicId: 'signatures/sample_signature_1',
          originalName: 'sarah_signature.png',
          createdAt: new Date()
        },
        createdBy: admin._id
      },
      {
        email: 'supervisor@acesmovers.com',
        password: 'Super123!',
        fullName: 'James Mukasa',
        role: 'user',
        status: 'active',
        phonePrimary: '+256701000004',
        phoneSecondary: '+256701000005',
        address: 'Plot 78, Bukoto Street, Kampala',
        emergencyContact: '+256701000006',
        signature: {
          type: 'canvas',
          data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          createdAt: new Date()
        },
        createdBy: admin._id
      },
      {
        email: 'coordinator@acesmovers.com',
        password: 'Coord123!',
        fullName: 'Grace Namutebi',
        role: 'user',
        status: 'active',
        phonePrimary: '+256701000007',
        phoneSecondary: '+256701000008',
        address: 'Plot 12, Kololo Heights, Kampala',
        emergencyContact: '+256701000009',
        signature: {
          type: 'upload',
          data: 'https://res.cloudinary.com/dvedpgxcz/image/upload/v1757960352/default_wiyefz.jpg',
          publicId: 'signatures/sample_signature_3',
          originalName: 'grace_signature.png',
          createdAt: new Date()
        },
        createdBy: admin._id
      }
    ];

    const createdUsers = [];
    for (const userData of testUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log('✅ User created:', user.fullName, '(' + user.email + ')');
    }
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    // Close database connection
    mongoose.connection.close();
    process.exit(0);
  }
};

// Run the seeder if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
