/**
 * Migration: Update BOX receipt type to ITEM
 *
 * This migration updates all existing box receipts to item receipts:
 * 1. Updates receiptType field from "box" to "item" in receipts
 * 2. Updates receiptNumber prefix from "AMRC-BOX-XXXXX" to "AMRC-ITM-XXXXX"
 */

const mongoose = require('mongoose');

// Database connection
const connectDB = async () => {
  try {
    require('dotenv').config({ path: '../../.env' });
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aces-movers';
    console.log('🔗 Connecting to:', mongoURI.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in log
    await mongoose.connect(mongoURI);
    console.log('📦 Connected to MongoDB for migration');

    // Test connection with a quick count
    const db = mongoose.connection.db;
    const count = await db.collection('receipts').countDocuments();
    console.log('📊 Total receipts in database:', count);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Migration function
const migrateBoxToItem = async () => {
  try {
    console.log('🚀 Starting BOX to ITEM migration...');

    const db = mongoose.connection.db;

    // Step 1: Update receiptType from "box" to "item"
    console.log('📝 Step 1: Updating receiptType field...');
    const receiptTypeUpdate = await db.collection('receipts').updateMany(
      { receiptType: 'box' },
      { $set: { receiptType: 'item' } }
    );
    console.log(`   ✅ Updated ${receiptTypeUpdate.modifiedCount} receipts with receiptType "box" to "item"`);

    // Step 2: Update receiptNumber prefix from "AMRC-BOX-XXXXX" to "AMRC-ITM-XXXXX"
    console.log('📝 Step 2: Updating receiptNumber prefix...');
    const receiptNumberUpdate = await db.collection('receipts').updateMany(
      { receiptNumber: { $regex: '^AMRC-BOX-' } },
      [
        {
          $set: {
            receiptNumber: {
              $replaceOne: {
                input: '$receiptNumber',
                find: 'AMRC-BOX-',
                replacement: 'AMRC-ITM-'
              }
            }
          }
        }
      ]
    );
    console.log(`   ✅ Updated ${receiptNumberUpdate.modifiedCount} receipts with receiptNumber prefix "AMRC-BOX-" to "AMRC-ITM-"`);

    // Step 3: Verification
    console.log('🔍 Step 3: Verification...');
    const itemReceipts = await db.collection('receipts').countDocuments({ receiptType: 'item' });
    const boxReceipts = await db.collection('receipts').countDocuments({ receiptType: 'box' });
    const itmReceiptNumbers = await db.collection('receipts').countDocuments({ receiptNumber: { $regex: '^AMRC-ITM-' } });
    const boxReceiptNumbers = await db.collection('receipts').countDocuments({ receiptNumber: { $regex: '^AMRC-BOX-' } });

    console.log(`   📊 Results:`);
    console.log(`      - Receipts with type "item": ${itemReceipts}`);
    console.log(`      - Receipts with type "box": ${boxReceipts} (should be 0)`);
    console.log(`      - Receipt numbers with "AMRC-ITM-": ${itmReceiptNumbers}`);
    console.log(`      - Receipt numbers with "AMRC-BOX-": ${boxReceiptNumbers} (should be 0)`);

    console.log('✅ Migration completed successfully!');
    console.log(`📋 Summary: Updated ${receiptTypeUpdate.modifiedCount} receipt types and ${receiptNumberUpdate.modifiedCount} receipt numbers`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Rollback function (in case we need to revert)
const rollbackItemToBox = async () => {
  try {
    console.log('🔄 Starting ITEM to BOX rollback...');

    const db = mongoose.connection.db;

    // Rollback receiptType from "item" to "box"
    const receiptTypeRollback = await db.collection('receipts').updateMany(
      { receiptType: 'item' },
      { $set: { receiptType: 'box' } }
    );
    console.log(`   ✅ Rolled back ${receiptTypeRollback.modifiedCount} receipts with receiptType "item" to "box"`);

    // Rollback receiptNumber prefix from "AMRC-ITM-" to "AMRC-BOX-"
    const receiptNumberRollback = await db.collection('receipts').updateMany(
      { receiptNumber: { $regex: '^AMRC-ITM-' } },
      [
        {
          $set: {
            receiptNumber: {
              $replaceOne: {
                input: '$receiptNumber',
                find: 'AMRC-ITM-',
                replacement: 'AMRC-BOX-'
              }
            }
          }
        }
      ]
    );
    console.log(`   ✅ Rolled back ${receiptNumberRollback.modifiedCount} receipt numbers`);

    console.log('✅ Rollback completed successfully!');
    console.log(`📋 Summary: Rolled back ${receiptTypeRollback.modifiedCount} receipt types and ${receiptNumberRollback.modifiedCount} receipt numbers`);

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  await connectDB();

  const action = process.argv[2];

  try {
    if (action === 'rollback') {
      await rollbackItemToBox();
    } else {
      await migrateBoxToItem();
    }
  } catch (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📦 Database connection closed');
    process.exit(0);
  }
};

// Run the migration
if (require.main === module) {
  main();
}

module.exports = {
  migrateBoxToItem,
  rollbackItemToBox
};