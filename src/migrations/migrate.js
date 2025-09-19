/**
 * Migration Runner
 * Handles running database migrations
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor() {
    this.migrationsPath = __dirname;
    this.migrationCollectionName = 'migrations';
  }

  async connect() {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/aces_movers'
      );
    }
    this.db = mongoose.connection.db;
  }

  async disconnect() {
    await mongoose.disconnect();
  }

  async getMigrationFiles() {
    const files = fs
      .readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.js') && file !== 'migrate.js')
      .sort();

    return files.map(file => ({
      name: file.replace('.js', ''),
      path: path.join(this.migrationsPath, file)
    }));
  }

  async getAppliedMigrations() {
    const collection = this.db.collection(this.migrationCollectionName);
    const applied = await collection.find({}).toArray();
    return applied.map(m => m.name);
  }

  async markMigrationAsApplied(name) {
    const collection = this.db.collection(this.migrationCollectionName);
    await collection.insertOne({
      name,
      appliedAt: new Date()
    });
  }

  async markMigrationAsRolledBack(name) {
    const collection = this.db.collection(this.migrationCollectionName);
    await collection.deleteOne({ name });
  }

  async runMigrations() {
    console.log('Starting migration process...');

    await this.connect();

    try {
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file.name)
      );

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations found');
        return;
      }

      console.log(`Found ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        console.log(`Running migration: ${migration.name}`);

        try {
          const migrationModule = require(migration.path);
          await migrationModule.up(this.db);
          await this.markMigrationAsApplied(migration.name);
          console.log(`✅ Migration ${migration.name} completed successfully`);
        } catch (error) {
          console.error(`❌ Migration ${migration.name} failed:`, error);
          throw error;
        }
      }

      console.log('All migrations completed successfully');
    } finally {
      await this.disconnect();
    }
  }

  async rollbackMigration(migrationName) {
    console.log(`Rolling back migration: ${migrationName}`);

    await this.connect();

    try {
      const migrationFiles = await this.getMigrationFiles();
      const migrationFile = migrationFiles.find(f => f.name === migrationName);

      if (!migrationFile) {
        throw new Error(`Migration ${migrationName} not found`);
      }

      const appliedMigrations = await this.getAppliedMigrations();
      if (!appliedMigrations.includes(migrationName)) {
        throw new Error(`Migration ${migrationName} has not been applied`);
      }

      const migrationModule = require(migrationFile.path);
      await migrationModule.down(this.db);
      await this.markMigrationAsRolledBack(migrationName);

      console.log(`✅ Migration ${migrationName} rolled back successfully`);
    } finally {
      await this.disconnect();
    }
  }

  async getStatus() {
    await this.connect();

    try {
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      console.log('\nMigration Status:');
      console.log('==================');

      for (const file of migrationFiles) {
        const status = appliedMigrations.includes(file.name)
          ? '✅ Applied'
          : '⏳ Pending';
        console.log(`${status} - ${file.name}`);
      }

      console.log(`\nTotal: ${migrationFiles.length} migrations`);
      console.log(`Applied: ${appliedMigrations.length}`);
      console.log(
        `Pending: ${migrationFiles.length - appliedMigrations.length}`
      );
    } finally {
      await this.disconnect();
    }
  }
}

// CLI interface
if (require.main === module) {
  const runner = new MigrationRunner();
  const command = process.argv[2];
  const migrationName = process.argv[3];

  switch (command) {
    case 'up':
      runner.runMigrations().catch(console.error);
      break;
    case 'down':
      if (!migrationName) {
        console.error('Please specify migration name to rollback');
        process.exit(1);
      }
      runner.rollbackMigration(migrationName).catch(console.error);
      break;
    case 'status':
      runner.getStatus().catch(console.error);
      break;
    default:
      console.log('Usage:');
      console.log('  node migrate.js up           - Run pending migrations');
      console.log(
        '  node migrate.js down <name>  - Rollback specific migration'
      );
      console.log('  node migrate.js status       - Show migration status');
      break;
  }
}

module.exports = MigrationRunner;
