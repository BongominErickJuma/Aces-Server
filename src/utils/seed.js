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
      fullName: 'System Administrator',
      role: 'admin',
      status: 'active',
      phonePrimary: '+256700000000',
      phoneSecondary: '+256700000002',
      address: 'Aces Movers Head Office, Plot 123, Kampala Road, Kampala',
      emergencyContact: '+256700000001',
      bankDetails: {
        accountNumber: '1234567890',
        accountName: 'System Administrator',
        bankName: 'Stanbic Bank Uganda',
        swiftCode: 'SBICUGKX',
        branch: 'Kampala Main Branch'
      },
      mobileMoneyDetails: {
        mtnNumber: '+256782000000',
        airtelNumber: '+256752000000'
      },
      profileCompleted: true // Set to true for admin
    };

    const admin = new User(adminData);
    await admin.save();

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password: Admin123!');
    console.log('⚠️  Please change the password after first login');

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
        bankDetails: {
          accountNumber: '9876543210',
          accountName: 'Sarah Nakato',
          bankName: 'Centenary Bank',
          swiftCode: 'CENTUGS1',
          branch: 'Ntinda Branch'
        },
        mobileMoneyDetails: {
          mtnNumber: '+256782000001',
          airtelNumber: '+256752000001'
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
        bankDetails: {
          accountNumber: '5555666677',
          accountName: 'James Mukasa',
          bankName: 'DFCU Bank',
          swiftCode: 'DFCUUGKA',
          branch: 'Bukoto Branch'
        },
        mobileMoneyDetails: {
          mtnNumber: '+256782000004',
          airtelNumber: '+256752000004'
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
        bankDetails: {
          accountNumber: '8888999900',
          accountName: 'Grace Namutebi',
          bankName: 'Equity Bank Uganda',
          swiftCode: 'EQBLUGKA',
          branch: 'Kololo Branch'
        },
        mobileMoneyDetails: {
          mtnNumber: '+256782000007',
          airtelNumber: '+256752000007'
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

    // Create sample quotations
    console.log('\n📝 Creating sample quotations...');

    const quotations = [
      // Residential Move Quotation
      {
        type: 'Residential',
        client: {
          name: 'Robert Ssebugwawo',
          phone: '+256703123456',
          email: 'robert.s@gmail.com'
        },
        locations: {
          from: 'Plot 15, Bugolobi Estate, Kampala',
          to: 'House 42, Muyenga Hill, Kampala',
          movingDate: new Date('2025-11-15')
        },
        services: [
          {
            name: 'Packing Services',
            description:
              'Professional packing of household items including fragile items',
            quantity: 1,
            unitPrice: 650000,
            total: 650000
          },
          {
            name: 'Transportation',
            description: 'Safe transportation with modern moving truck',
            quantity: 1,
            unitPrice: 400000,
            total: 400000
          },
          {
            name: 'Labor Services',
            description: 'Loading, unloading, and furniture arrangement',
            quantity: 6,
            unitPrice: 45000,
            total: 270000
          }
        ],
        pricing: {
          currency: 'UGX',
          discount: 50000,
          subtotal: 0, // Will be calculated by pre-save middleware
          taxAmount: 0, // Will be calculated by pre-save middleware
          totalAmount: 0 // Will be calculated by pre-save middleware
        },
        validity: {
          daysValid: 30
        },
        termsAndConditions:
          'Payment terms: 50% deposit required to confirm booking. Cancellation policy: 48 hours notice required for full refund. Insurance available at 2% of declared value.',
        notes:
          'Client prefers morning pickup. Special care needed for piano and artwork.',
        createdBy: admin._id
      },

      // International Move Quotation
      {
        type: 'International',
        client: {
          name: 'Diana Namukasa',
          phone: '+256704567890',
          email: 'diana.n@yahoo.com'
        },
        locations: {
          from: 'Apartment 3B, Acacia Mall Towers, Kampala',
          to: 'Dubai, United Arab Emirates',
          movingDate: new Date('2025-12-20')
        },
        services: [
          {
            name: 'International Packing',
            description:
              'Export-quality packing with wooden crates for fragile items',
            quantity: 1,
            unitPrice: 1200000,
            total: 1200000
          },
          {
            name: 'Sea Freight',
            description: 'Container shipping from Mombasa to Dubai port',
            quantity: 1,
            unitPrice: 2800000,
            total: 2800000
          },
          {
            name: 'Border Clearance',
            description: 'Customs clearance and documentation at both ends',
            quantity: 1,
            unitPrice: 800000,
            total: 800000
          },
          {
            name: 'Insurance Coverage',
            description:
              'Full replacement value insurance for international transit',
            quantity: 1,
            unitPrice: 400000,
            total: 400000
          }
        ],
        pricing: {
          currency: 'USD',
          discount: 200,
          subtotal: 0, // Will be calculated by pre-save middleware
          taxAmount: 0, // Will be calculated by pre-save middleware
          totalAmount: 0 // Will be calculated by pre-save middleware
        },
        validity: {
          daysValid: 45
        },
        termsAndConditions:
          'Payment: 60% deposit, 40% on delivery. Transit time: 21-28 days. All customs duties payable by client.',
        notes:
          'Requires export permit for antique furniture. Client to provide inventory list.',
        createdBy: createdUsers[0]._id
      },

      // Office Move Quotation
      {
        type: 'Office',
        client: {
          name: 'Michael Lubega',
          phone: '+256705789012',
          email: 'michael@techsolutions.co.ug',
          company: 'Tech Solutions Uganda Ltd'
        },
        locations: {
          from: 'Floor 4, Workers House, Kampala',
          to: 'Plot 24, Industrial Area, Kampala',
          movingDate: new Date('2025-10-28')
        },
        services: [
          {
            name: 'IT Equipment Handling',
            description:
              'Specialized packing and moving of servers and computers',
            quantity: 1,
            unitPrice: 900000,
            total: 900000
          },
          {
            name: 'Office Furniture',
            description:
              'Disassembly, transport, and reassembly of office furniture',
            quantity: 1,
            unitPrice: 600000,
            total: 600000
          },
          {
            name: 'Document Handling',
            description:
              'Secure packing and transport of confidential documents',
            quantity: 1,
            unitPrice: 200000,
            total: 200000
          },
          {
            name: 'Weekend Premium',
            description:
              'Weekend moving service to minimize business disruption',
            quantity: 1,
            unitPrice: 300000,
            total: 300000
          }
        ],
        pricing: {
          currency: 'UGX',
          discount: 100000,
          subtotal: 0, // Will be calculated by pre-save middleware
          taxAmount: 0, // Will be calculated by pre-save middleware
          totalAmount: 0 // Will be calculated by pre-save middleware
        },
        validity: {
          daysValid: 21
        },
        termsAndConditions:
          'Payment: 50% deposit, 50% on completion. Moving scheduled for weekend to minimize downtime. IT setup assistance included.',
        notes:
          'Requires after-hours access cards. Server downtime window: Saturday 6PM - Sunday 8AM.',
        createdBy: createdUsers[1]._id
      }
    ];

    const createdQuotations = [];
    for (const quotationData of quotations) {
      const quotationNumber = await Quotation.generateQuotationNumber();
      quotationData.quotationNumber = quotationNumber;

      const quotation = new Quotation(quotationData);
      await quotation.save();
      createdQuotations.push(quotation);
      console.log(
        '✅ Quotation created:',
        quotation.type,
        '-',
        quotation.quotationNumber
      );
    }

    // Create sample receipts
    console.log('\n🧾 Creating sample receipts...');

    const receipts = [
      // Box Receipt
      {
        receiptType: 'box',
        client: {
          name: 'Patricia Namatovu',
          phone: '+256706123789',
          email: 'patricia.n@outlook.com',
          address: 'Plot 89, Nakawa Estate, Kampala'
        },
        services: [
          {
            description: 'Storage Box Rental - Medium Size (1 month)',
            quantity: 5,
            amount: 50000,
            total: 250000
          },
          {
            description: 'Storage Box Rental - Large Size (1 month)',
            quantity: 3,
            amount: 75000,
            total: 225000
          },
          {
            description: 'Box Delivery Service',
            quantity: 1,
            amount: 30000,
            total: 30000
          }
        ],
        payment: {
          totalAmount: 505000,
          amountPaid: 505000,
          currency: 'UGX',
          status: 'paid',
          method: 'mobile_money',
          dueDate: new Date('2025-10-15')
        },
        signatures: {
          receivedBy: 'Sarah Nakato',
          receivedByTitle: 'Operations Manager',
          clientName: 'Patricia Namatovu'
        },
        notes: 'Boxes to be collected monthly. Client has key code access.',
        createdBy: createdUsers[0]._id
      },

      // Commitment Receipt
      {
        receiptType: 'commitment',
        client: {
          name: 'Andrew Kiprotich',
          phone: '+256707456123',
          email: 'andrew.k@company.com',
          address: 'House 23, Bunga Hill, Kampala'
        },
        locations: {
          from: 'House 23, Bunga Hill, Kampala',
          to: 'Apartment 15C, Naguru Towers, Kampala',
          movingDate: new Date('2025-11-20')
        },
        services: [
          {
            description: 'Moving Service Commitment Fee (50% deposit)',
            quantity: 1,
            amount: 750000,
            total: 750000
          }
        ],
        payment: {
          totalAmount: 750000,
          amountPaid: 750000,
          currency: 'UGX',
          status: 'paid',
          method: 'bank_transfer',
          dueDate: new Date('2025-10-20')
        },
        signatures: {
          receivedBy: 'James Mukasa',
          receivedByTitle: 'Operations Supervisor',
          clientName: 'Andrew Kiprotich'
        },
        notes:
          'Commitment for full moving service valued at UGX 1,500,000. Balance due on completion.',
        createdBy: createdUsers[1]._id
      },

      // Final Receipt
      {
        receiptType: 'final',
        client: {
          name: 'Andrew Kiprotich',
          phone: '+256707456123',
          email: 'andrew.k@company.com',
          address: 'Apartment 15C, Naguru Towers, Kampala'
        },
        locations: {
          from: 'House 23, Bunga Hill, Kampala',
          to: 'Apartment 15C, Naguru Towers, Kampala',
          movingDate: new Date('2025-11-20')
        },
        services: [
          {
            description: 'Complete Moving Service - Final Payment',
            quantity: 1,
            amount: 750000,
            total: 750000
          },
          {
            description: 'Additional Packing Materials',
            quantity: 1,
            amount: 50000,
            total: 50000
          }
        ],
        payment: {
          totalAmount: 800000,
          amountPaid: 800000,
          currency: 'UGX',
          status: 'paid',
          method: 'cash',
          dueDate: new Date('2025-11-20')
        },
        commitmentFee: {
          amount: 750000,
          paidDate: new Date('2025-10-20')
        },
        signatures: {
          receivedBy: 'Grace Namutebi',
          receivedByTitle: 'Move Coordinator',
          clientName: 'Andrew Kiprotich'
        },
        notes:
          'Final receipt for completed move. Total project value: UGX 1,550,000',
        createdBy: createdUsers[2]._id
      },

      // One-time Receipt
      {
        receiptType: 'one_time',
        client: {
          name: 'Rose Nambi',
          phone: '+256708789456',
          email: 'rose.nambi@gmail.com',
          address: 'Plot 67, Mutungo Estate, Kampala'
        },
        locations: {
          from: 'Plot 67, Mutungo Estate, Kampala',
          to: 'Plot 12, Kisaasi Road, Kampala',
          movingDate: new Date('2025-10-25')
        },
        services: [
          {
            description: 'Single Room Moving Service',
            quantity: 1,
            amount: 200000,
            total: 200000
          },
          {
            description: 'Basic Packing Materials',
            quantity: 1,
            amount: 35000,
            total: 35000
          },
          {
            description: 'Helper Labor (2 hours)',
            quantity: 2,
            amount: 25000,
            total: 50000
          }
        ],
        payment: {
          totalAmount: 285000,
          amountPaid: 285000,
          currency: 'UGX',
          status: 'paid',
          method: 'mobile_money',
          dueDate: new Date('2025-10-25')
        },
        signatures: {
          receivedBy: 'Sarah Nakato',
          receivedByTitle: 'Operations Manager',
          clientName: 'Rose Nambi'
        },
        notes:
          'Quick single-room move completed same day. Client very satisfied with service.',
        createdBy: admin._id
      }
    ];

    const createdReceipts = [];
    for (const receiptData of receipts) {
      const receiptNumber = await Receipt.generateReceiptNumber(
        receiptData.receiptType
      );
      receiptData.receiptNumber = receiptNumber;

      // Link commitment and final receipts
      if (
        receiptData.receiptType === 'final' &&
        receiptData.client.name === 'Andrew Kiprotich'
      ) {
        const commitmentReceipt = createdReceipts.find(
          r =>
            r.receiptType === 'commitment' &&
            r.client.name === 'Andrew Kiprotich'
        );
        if (commitmentReceipt) {
          receiptData.commitmentFee.commitmentReceiptId = commitmentReceipt._id;
        }
      }

      const receipt = new Receipt(receiptData);
      await receipt.save();
      createdReceipts.push(receipt);
      console.log(
        '✅ Receipt created:',
        receipt.receiptType.toUpperCase(),
        '-',
        receipt.receiptNumber
      );
    }

    console.log('\n🎉 Database seeding completed successfully!');
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
