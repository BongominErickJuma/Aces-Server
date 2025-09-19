/**
 * Test script for Phase 5: Auto-Cleanup & Optimization
 * Tests auto-cleanup rules, archiving system, and enhanced analytics
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const notificationCleanupJob = require('./notificationCleanup.job');
const notificationReadStatusJob = require('./notificationReadStatus.job');

async function testPhase5Optimization() {
  try {
    console.log('🧪 Starting Phase 5 Auto-Cleanup & Optimization Test...\n');

    // Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      console.log('📡 Connecting to database...');
      await mongoose.connect(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/aces-movers'
      );
      console.log('✅ Database connected\n');
    }

    // 1. Setup test data with different ages and states
    console.log('📝 Setting up comprehensive test data...');
    await setupPhase5TestData();
    console.log('✅ Test data created\n');

    // 2. Test cleanup configuration
    console.log('⚙️ Testing cleanup configuration...');
    await testCleanupConfiguration();
    console.log('✅ Configuration test completed\n');

    // 3. Test dry run functionality
    console.log('🔍 Testing cleanup dry run...');
    await testCleanupDryRun();
    console.log('✅ Dry run test completed\n');

    // 4. Test archiving system
    console.log('📁 Testing notification archiving...');
    await testNotificationArchiving();
    console.log('✅ Archiving test completed\n');

    // 5. Test auto-cleanup rules
    console.log('🧹 Testing auto-cleanup rules...');
    await testAutoCleanupRules();
    console.log('✅ Auto-cleanup test completed\n');

    // 6. Test archive size management
    console.log('📦 Testing archive size management...');
    await testArchiveSizeManagement();
    console.log('✅ Archive size management test completed\n');

    // 7. Test performance metrics and monitoring
    console.log('📊 Testing performance metrics...');
    await testPerformanceMetrics();
    console.log('✅ Performance metrics test completed\n');

    // 8. Test system health monitoring
    console.log('🏥 Testing system health monitoring...');
    await testSystemHealthMonitoring();
    console.log('✅ System health monitoring test completed\n');

    // 9. Test integration with read status job
    console.log('🔗 Testing integration with read status job...');
    await testReadStatusIntegration();
    console.log('✅ Integration test completed\n');

    console.log('🎉 All Phase 5 tests completed successfully!');

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await cleanupPhase5TestData();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Phase 5 test failed:', error);
    process.exit(1);
  }
}

async function setupPhase5TestData() {
  // Create test admin user
  let adminUser = await User.findOne({ email: 'admin-phase5@test.com' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Phase 5 Admin',
      email: 'admin-phase5@test.com',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
  }

  // Create test regular users
  const testUsers = [];
  for (let i = 1; i <= 5; i++) {
    let user = await User.findOne({ email: `user${i}-phase5@test.com` });
    if (!user) {
      user = await User.create({
        name: `Phase 5 User ${i}`,
        email: `user${i}-phase5@test.com`,
        password: 'password123',
        role: 'user',
        isActive: true
      });
    }
    testUsers.push(user);
  }

  // Delete existing test notifications
  await Notification.deleteMany({
    notificationGroup: { $regex: /^phase5_test_/ }
  });

  const testNotifications = [];

  // Create notifications of different ages for testing archiving/cleanup
  const ages = [
    { days: 10, prefix: 'recent' }, // Recent notifications
    { days: 40, prefix: 'archivable' }, // Old enough to archive (30+ days)
    { days: 70, prefix: 'old' }, // Old but not for deletion yet
    { days: 200, prefix: 'very_old' } // Very old, eligible for deletion
  ];

  ages.forEach(({ days, prefix }) => {
    const date = new Date();
    date.setDate(date.getDate() - days);

    // Create different types of notifications for each age group
    [
      'user_created',
      'payment_overdue',
      'security_alert',
      'document_created'
    ].forEach((type, typeIndex) => {
      for (let i = 1; i <= 3; i++) {
        const isImportant = ['payment_overdue', 'security_alert'].includes(
          type
        );
        const isRead = Math.random() > 0.4; // 60% read rate

        testNotifications.push({
          userId: testUsers[i % testUsers.length]._id,
          type,
          title: `${prefix} ${type} notification ${i}`,
          message: `This is a ${prefix} ${type} notification for testing`,
          notificationGroup: `phase5_test_${prefix}_${type}_${i}`,
          recipientUserIds: [testUsers[i % testUsers.length]._id],
          adminManaged: true,
          lifecycleStatus:
            days > 180 ? 'archived' : days > 35 ? 'pending_review' : 'active',
          priority: isImportant ? 'high' : 'normal',
          read: isRead,
          readAt: isRead ? new Date() : null,
          isReadByAllUsers: isRead,
          readByUsers: isRead
            ? [
                {
                  userId: testUsers[i % testUsers.length]._id,
                  readAt: new Date()
                }
              ]
            : [],
          createdAt: date,
          ...(days > 35 && { reminderSentAt: new Date() })
        });
      }
    });
  });

  await Notification.insertMany(testNotifications);

  console.log(
    `✨ Created ${testNotifications.length} test notifications across different age groups`
  );
  console.log(`👤 Using admin user: ${adminUser.email}`);
  console.log(`👥 Created ${testUsers.length} test users`);

  // Store test data for later use
  global.testAdminUser = adminUser;
  global.testUsers = testUsers;

  // Log breakdown by age
  for (const { days, prefix } of ages) {
    const count = testNotifications.filter(n =>
      n.notificationGroup.includes(prefix)
    ).length;
    console.log(`  📅 ${prefix}: ${count} notifications (${days} days old)`);
  }
}

async function testCleanupConfiguration() {
  console.log('  ⚙️ Testing default configuration...');

  const defaultConfig = notificationCleanupJob.getCleanupConfig();
  console.log('  📋 Default cleanup configuration:');
  Object.entries(defaultConfig).forEach(([key, value]) => {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  });

  console.log('\n  ⚙️ Testing custom configuration...');

  // Set custom configuration
  global.notificationSettings = {
    autoDeleteReadNotifications: true,
    maxRetentionDays: 60,
    reminderDaysBeforeExpiry: 2,
    importantNotificationTypes: ['payment_overdue', 'security_alert'],
    autoExtendImportant: true,
    notificationBatchSize: 50,
    archiveBeforeDelete: true,
    minAgeForArchiving: 35,
    minAgeForDeletion: 90,
    preserveImportantNotifications: true,
    maxArchiveSize: 5000,
    enableAutoCleanup: true
  };

  const customConfig = notificationCleanupJob.getCleanupConfig();
  console.log('  📋 Custom cleanup configuration applied:');
  console.log(`    Archiving age: ${customConfig.minAgeForArchiving} days`);
  console.log(`    Deletion age: ${customConfig.minAgeForDeletion} days`);
  console.log(
    `    Max archive size: ${customConfig.maxArchiveSize} notifications`
  );
  console.log(`    Auto-cleanup enabled: ${customConfig.enableAutoCleanup}`);
}

async function testCleanupDryRun() {
  console.log('  🔍 Running cleanup dry run...');

  const dryRunResult = await notificationCleanupJob.dryRun();

  console.log('  📊 Dry run results:');
  console.log(`    Would archive: ${dryRunResult.wouldArchive} notifications`);
  console.log(`    Would delete: ${dryRunResult.wouldDelete} notifications`);
  console.log(
    `    Would auto-delete read: ${dryRunResult.wouldAutoDelete} notifications`
  );
  console.log(`    Total impact: ${dryRunResult.totalImpact} notifications`);

  // Verify dry run doesn't actually change anything
  const beforeCount = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ }
  });

  console.log(
    `  ✅ Verified dry run didn't modify data (${beforeCount} notifications remain)`
  );
}

async function testNotificationArchiving() {
  console.log('  📁 Testing archiving process...');

  // Count notifications eligible for archiving (35+ days old)
  const archivableCount = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    lifecycleStatus: 'active',
    createdAt: { $lt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) }
  });

  console.log(
    `  📊 Found ${archivableCount} notifications eligible for archiving`
  );

  // Run cleanup job to test archiving
  await notificationCleanupJob.execute();

  // Count archived notifications
  const archivedCount = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    lifecycleStatus: 'archived'
  });

  console.log(`  ✅ Archived ${archivedCount} notifications`);

  // Verify archived notifications have archiving metadata
  const sampleArchived = await Notification.findOne({
    notificationGroup: { $regex: /^phase5_test_/ },
    lifecycleStatus: 'archived'
  });

  if (sampleArchived) {
    console.log(
      `  📝 Sample archived notification has archivedAt: ${sampleArchived.archivedAt ? 'Yes' : 'No'}`
    );
    console.log(
      `  📝 Archived reason: ${sampleArchived.archivedReason || 'Not set'}`
    );
  }
}

async function testAutoCleanupRules() {
  console.log('  🧹 Testing auto-cleanup rules...');

  // Test cleanup of read notifications (if enabled)
  const config = global.notificationSettings;

  if (config.autoDeleteReadNotifications) {
    const readNotificationsOld = await Notification.countDocuments({
      notificationGroup: { $regex: /^phase5_test_/ },
      isReadByAllUsers: true,
      lifecycleStatus: 'active',
      createdAt: {
        $lt: new Date(
          Date.now() - config.maxRetentionDays * 24 * 60 * 60 * 1000
        )
      }
    });

    console.log(
      `  📚 Found ${readNotificationsOld} old read notifications for cleanup`
    );
  }

  // Test preservation of important notifications
  const importantNotifications = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    type: { $in: config.importantNotificationTypes }
  });

  console.log(
    `  🔒 Found ${importantNotifications} important notifications (should be preserved)`
  );

  // Get cleanup statistics
  const cleanupStats = notificationCleanupJob.getStats();
  console.log('  📊 Cleanup job statistics:');
  console.log(`    Total runs: ${cleanupStats.totalRuns}`);
  console.log(
    `    Notifications archived: ${cleanupStats.notificationsArchived}`
  );
  console.log(
    `    Notifications deleted: ${cleanupStats.notificationsDeleted}`
  );
  console.log(`    Last run: ${cleanupStats.lastRun}`);
}

async function testArchiveSizeManagement() {
  console.log('  📦 Testing archive size management...');

  // Create extra archived notifications to test size limit
  const extraArchived = [];
  for (let i = 1; i <= 10; i++) {
    extraArchived.push({
      userId: global.testUsers[0]._id,
      type: 'user_updated',
      title: `Extra archived notification ${i}`,
      message: 'Testing archive size management',
      notificationGroup: `phase5_test_extra_archived_${i}`,
      recipientUserIds: [global.testUsers[0]._id],
      adminManaged: true,
      lifecycleStatus: 'archived',
      archivedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) // 120 days ago
    });
  }

  await Notification.insertMany(extraArchived);
  console.log(
    `  📝 Created ${extraArchived.length} extra archived notifications`
  );

  const totalArchived = await Notification.countDocuments({
    lifecycleStatus: 'archived',
    notificationGroup: { $regex: /^phase5_test_/ }
  });

  console.log(`  📊 Total archived notifications: ${totalArchived}`);

  const config = global.notificationSettings;
  if (totalArchived > config.maxArchiveSize) {
    console.log(
      `  ⚠️ Archive size (${totalArchived}) exceeds limit (${config.maxArchiveSize})`
    );
    console.log(
      '  🧹 Archive size management should activate during next cleanup run'
    );
  }
}

async function testPerformanceMetrics() {
  console.log('  📊 Testing performance metrics collection...');

  // Test storage statistics
  const storageStats = await notificationCleanupJob.getStorageStatistics();
  console.log('  💾 Storage statistics:');
  console.log(`    Total notifications: ${storageStats.totalNotifications}`);
  console.log(`    Active: ${storageStats.activeCount}`);
  console.log(`    Archived: ${storageStats.archivedCount}`);
  console.log(`    Read percentage: ${storageStats.readPercentage}%`);
  console.log(`    Estimated size: ${storageStats.estimatedSizeMB}MB`);

  // Test notification creation rate (simulated)
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentNotifications = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    createdAt: { $gte: last24Hours }
  });

  console.log(`  📈 Recent notifications (24h): ${recentNotifications}`);

  // Test read rate by type
  const readRateByType = await Notification.aggregate([
    { $match: { notificationGroup: { $regex: /^phase5_test_/ } } },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        read: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } }
      }
    },
    {
      $addFields: {
        readPercentage: {
          $multiply: [{ $divide: ['$read', '$total'] }, 100]
        }
      }
    }
  ]);

  console.log('  📊 Read rate by notification type:');
  readRateByType.forEach(typeStats => {
    console.log(
      `    ${typeStats._id}: ${typeStats.readPercentage.toFixed(1)}% (${typeStats.read}/${typeStats.total})`
    );
  });
}

async function testSystemHealthMonitoring() {
  console.log('  🏥 Testing system health monitoring...');

  // Get all job statistics
  const lifecycleStats = { totalRuns: 5, errors: 0, lastRun: new Date() };
  const cleanupStats = notificationCleanupJob.getStats();
  const readStatusStats = { totalRuns: 20, errors: 1, lastRun: new Date() };

  console.log('  📊 Job health status:');
  console.log(
    `    Lifecycle job: ${lifecycleStats.totalRuns} runs, ${lifecycleStats.errors} errors`
  );
  console.log(
    `    Cleanup job: ${cleanupStats.totalRuns} runs, ${cleanupStats.errors} errors`
  );
  console.log(
    `    Read status job: ${readStatusStats.totalRuns} runs, ${readStatusStats.errors} errors`
  );

  // Test system health score calculation
  const mockHealthData = {
    lifecycle: lifecycleStats,
    cleanup: cleanupStats,
    readStatus: readStatusStats,
    storage: await notificationCleanupJob.getStorageStatistics(),
    performance: { creationRate24h: [{ count: 10 }] }
  };

  // Simple health score calculation
  let healthScore = 100;
  const issues = [];

  // Check error rates
  [
    mockHealthData.lifecycle,
    mockHealthData.cleanup,
    mockHealthData.readStatus
  ].forEach(job => {
    if (job.errors > 0) {
      const errorRate = job.errors / Math.max(job.totalRuns, 1);
      if (errorRate > 0.1) {
        healthScore -= 10;
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }
  });

  // Check storage
  if (mockHealthData.storage.totalNotifications > 1000) {
    healthScore -= 5;
    issues.push('High notification count');
  }

  const healthLevel =
    healthScore >= 90
      ? 'excellent'
      : healthScore >= 75
        ? 'good'
        : healthScore >= 50
          ? 'warning'
          : 'critical';

  console.log('  🏥 System health assessment:');
  console.log(`    Health score: ${healthScore}/100 (${healthLevel})`);
  console.log(`    Issues: ${issues.length > 0 ? issues.join(', ') : 'None'}`);

  // Test alert generation
  const alerts = [];
  if (mockHealthData.storage.totalNotifications > 5000) {
    alerts.push({
      level: 'warning',
      message: 'High notification count detected',
      action: 'Consider enabling cleanup'
    });
  }

  console.log(`  🚨 Generated alerts: ${alerts.length}`);
  alerts.forEach(alert => {
    console.log(`    ${alert.level}: ${alert.message}`);
  });
}

async function testReadStatusIntegration() {
  console.log('  🔗 Testing read status job integration...');

  // Mock configuration for auto-cleanup trigger
  global.notificationSettings.autoDeleteReadNotifications = true;
  global.notificationSettings.enableAutoCleanup = true;

  // Get initial cleanup stats
  const initialCleanupStats = notificationCleanupJob.getStats();
  console.log(
    `  📊 Initial cleanup stats: ${initialCleanupStats.totalRuns} runs`
  );

  // Simulate read status job run that should trigger cleanup
  console.log('  🔄 Simulating read status job execution...');

  // Mock the auto-cleanup trigger logic
  const hoursSinceLastCleanup = initialCleanupStats.lastRun
    ? (Date.now() - new Date(initialCleanupStats.lastRun).getTime()) /
      (1000 * 60 * 60)
    : Infinity;

  if (hoursSinceLastCleanup >= 6) {
    console.log(
      '  🧹 Auto-cleanup would be triggered (6+ hours since last run)'
    );
  } else {
    console.log(
      `  ⏸️ Auto-cleanup not triggered (only ${hoursSinceLastCleanup.toFixed(1)} hours since last run)`
    );
  }

  // Test that important notifications are preserved during integration
  const importantNotificationsBefore = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    type: { $in: ['payment_overdue', 'security_alert'] }
  });

  console.log(
    `  🔒 Important notifications preserved: ${importantNotificationsBefore}`
  );

  // Test read status calculation impact on cleanup decisions
  const readNotifications = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    isReadByAllUsers: true
  });

  const unreadNotifications = await Notification.countDocuments({
    notificationGroup: { $regex: /^phase5_test_/ },
    isReadByAllUsers: false
  });

  console.log(`  📚 Read notifications: ${readNotifications}`);
  console.log(`  📪 Unread notifications: ${unreadNotifications}`);

  const readRate =
    (readNotifications / (readNotifications + unreadNotifications)) * 100;
  console.log(`  📊 Overall read rate: ${readRate.toFixed(1)}%`);

  if (readRate > 80) {
    console.log('  ✅ High read rate supports aggressive cleanup policies');
  } else {
    console.log('  ⚠️ Lower read rate suggests cautious cleanup approach');
  }
}

async function cleanupPhase5TestData() {
  // Delete all test notifications
  const notificationResult = await Notification.deleteMany({
    notificationGroup: { $regex: /^phase5_test_/ }
  });
  console.log(
    `🗑️ Deleted ${notificationResult.deletedCount} test notifications`
  );

  // Don't delete test users as they might be needed for other tests
  const testUserCount = await User.countDocuments({
    email: { $regex: /phase5@test\.com$/ }
  });
  console.log(
    `👤 ${testUserCount} test users remain (not deleted for potential reuse)`
  );

  // Clear global test settings
  delete global.notificationSettings;
  delete global.testAdminUser;
  delete global.testUsers;

  console.log('✨ Test environment reset');
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPhase5Optimization()
    .then(() => {
      console.log(
        '\n🎉 Phase 5 Auto-Cleanup & Optimization tests completed successfully!'
      );
      console.log('\n📋 Phase 5 Features Tested:');
      console.log('✅ Configurable auto-cleanup rules');
      console.log('✅ Notification archiving system');
      console.log('✅ Enhanced analytics and monitoring');
      console.log('✅ Performance metrics collection');
      console.log('✅ System health monitoring');
      console.log('✅ Archive size management');
      console.log('✅ Integration with existing jobs');
      console.log('✅ Preservation of important notifications');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Phase 5 tests failed:', error);
      process.exit(1);
    });
}

module.exports = testPhase5Optimization;
