/**
 * Migration Runner
 *
 * Usage:
 * - To run box-to-item migration: node run-migration.js box-to-item
 * - To rollback: node run-migration.js box-to-item rollback
 */

require('dotenv').config();

const { migrateBoxToItem, rollbackItemToBox } = require('./002_update_box_to_item');

const runMigration = async () => {
  const migrationName = process.argv[2];
  const action = process.argv[3];

  if (!migrationName) {
    console.log('❌ Please specify a migration name');
    console.log('Available migrations:');
    console.log('  - box-to-item: Updates BOX receipt types to ITEM');
    console.log('');
    console.log('Usage:');
    console.log('  node run-migration.js box-to-item        # Run migration');
    console.log('  node run-migration.js box-to-item rollback  # Rollback migration');
    process.exit(1);
  }

  try {
    switch (migrationName) {
      case 'box-to-item':
        if (action === 'rollback') {
          console.log('🔄 Running BOX-to-ITEM rollback...');
          await rollbackItemToBox();
        } else {
          console.log('🚀 Running BOX-to-ITEM migration...');
          await migrateBoxToItem();
        }
        break;

      default:
        console.log(`❌ Unknown migration: ${migrationName}`);
        process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();