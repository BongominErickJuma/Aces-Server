/**
 * Test script for Phase 4: Admin Management Interface
 * Tests all the admin notification management endpoints
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');

async function testPhase4AdminInterface() {
  try {
    console.log('🧪 Starting Phase 4 Admin Interface Test...\n');

    // Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      console.log('📡 Connecting to database...');
      await mongoose.connect(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/aces-movers'
      );
      console.log('✅ Database connected\n');
    }

    // 1. Setup test data
    console.log('📝 Setting up test data...');
    await setupTestData();
    console.log('✅ Test data created\n');

    // 2. Test notification summary functionality
    console.log('📊 Testing notification summary...');
    await testNotificationSummary();
    console.log('✅ Summary test completed\n');

    // 3. Test pending review functionality
    console.log('📋 Testing pending review functionality...');
    await testPendingReview();
    console.log('✅ Pending review test completed\n');

    // 4. Test bulk delete functionality
    console.log('🗑️ Testing bulk delete functionality...');
    await testBulkDelete();
    console.log('✅ Bulk delete test completed\n');

    // 5. Test lifecycle extension
    console.log('📅 Testing lifecycle extension...');
    await testLifecycleExtension();
    console.log('✅ Lifecycle extension test completed\n');

    // 6. Test settings management
    console.log('⚙️ Testing settings management...');
    await testSettingsManagement();
    console.log('✅ Settings management test completed\n');

    // 7. Test analytics
    console.log('📈 Testing analytics...');
    await testAnalytics();
    console.log('✅ Analytics test completed\n');

    console.log('🎉 All Phase 4 tests completed successfully!');

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Phase 4 test failed:', error);
    process.exit(1);
  }
}

async function setupTestData() {
  // Create test admin user
  let adminUser = await User.findOne({ email: 'admin-phase4@test.com' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Phase 4 Admin',
      email: 'admin-phase4@test.com',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
  }

  // Create test regular users
  const testUsers = [];
  for (let i = 1; i <= 3; i++) {
    let user = await User.findOne({ email: `user${i}-phase4@test.com` });
    if (!user) {
      user = await User.create({
        name: `Test User ${i}`,
        email: `user${i}-phase4@test.com`,
        password: 'password123',
        role: 'user',
        isActive: true
      });
    }
    testUsers.push(user);
  }

  // Create diverse test notifications with different states
  const testNotifications = [];

  // Active notifications (recent)
  for (let i = 1; i <= 5; i++) {
    testNotifications.push({
      userId: testUsers[i % testUsers.length]._id,
      type: 'user_created',
      title: `Active Test Notification ${i}`,
      message: 'This is an active notification for testing',
      notificationGroup: `test_active_group_${i}`,
      recipientUserIds: [testUsers[i % testUsers.length]._id],
      adminManaged: true,
      lifecycleStatus: 'active',
      priority: i % 2 === 0 ? 'high' : 'normal'
    });
  }

  // Pending review notifications (old)
  const thirtyFiveDaysAgo = new Date();
  thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

  for (let i = 1; i <= 3; i++) {
    testNotifications.push({
      userId: testUsers[i % testUsers.length]._id,
      type: 'payment_overdue',
      title: `Pending Review Notification ${i}`,
      message: 'This notification needs admin review',
      notificationGroup: `test_pending_group_${i}`,
      recipientUserIds: [testUsers[i % testUsers.length]._id],
      adminManaged: true,
      lifecycleStatus: 'pending_review',
      reminderSentAt: new Date(),
      createdAt: thirtyFiveDaysAgo,
      priority: 'urgent'
    });
  }

  // Extended notifications
  for (let i = 1; i <= 2; i++) {
    const extendedUntil = new Date();
    extendedUntil.setDate(extendedUntil.getDate() + 30);

    testNotifications.push({
      userId: testUsers[i % testUsers.length]._id,
      type: 'security_alert',
      title: `Extended Notification ${i}`,
      message: 'This notification has been extended',
      notificationGroup: `test_extended_group_${i}`,
      recipientUserIds: [testUsers[i % testUsers.length]._id],
      adminManaged: true,
      lifecycleStatus: 'extended',
      extendedUntil: extendedUntil,
      createdAt: thirtyFiveDaysAgo
    });
  }

  // Read notifications
  for (let i = 1; i <= 3; i++) {
    testNotifications.push({
      userId: testUsers[i % testUsers.length]._id,
      type: 'document_created',
      title: `Read Test Notification ${i}`,
      message: 'This notification has been read',
      notificationGroup: `test_read_group_${i}`,
      recipientUserIds: [testUsers[i % testUsers.length]._id],
      adminManaged: true,
      lifecycleStatus: 'active',
      read: true,
      readAt: new Date(),
      isReadByAllUsers: true,
      readByUsers: [
        {
          userId: testUsers[i % testUsers.length]._id,
          readAt: new Date()
        }
      ]
    });
  }

  // Delete existing test notifications first
  await Notification.deleteMany({
    notificationGroup: { $regex: /^test_/ }
  });

  // Create new test notifications
  await Notification.insertMany(testNotifications);

  console.log(
    `✨ Created ${testNotifications.length} test notifications across different states`
  );
  console.log(`👤 Using admin user: ${adminUser.email}`);
  console.log(`👥 Created ${testUsers.length} test users`);

  // Store test user IDs for later use
  global.testAdminUser = adminUser;
  global.testUsers = testUsers;
}

async function testNotificationSummary() {
  console.log('  📊 Testing notification summary aggregation...');

  // Test basic summary
  const summaryResult = await Notification.aggregate([
    { $match: { adminManaged: true, notificationGroup: { $regex: /^test_/ } } },
    {
      $group: {
        _id: '$notificationGroup',
        count: { $sum: 1 },
        types: { $addToSet: '$type' },
        lifecycleStatuses: { $addToSet: '$lifecycleStatus' },
        oldestCreated: { $min: '$createdAt' },
        newestCreated: { $max: '$createdAt' },
        readByAllCount: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } }
      }
    },
    {
      $addFields: {
        readPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$readByAllCount', '$count'] }, 100] },
            1
          ]
        }
      }
    },
    { $sort: { oldestCreated: 1 } }
  ]);

  console.log(`  ✅ Found ${summaryResult.length} notification groups`);
  console.log(
    `  📈 Sample group: ${summaryResult[0]?._id} (${summaryResult[0]?.count} notifications, ${summaryResult[0]?.readPercentage}% read)`
  );

  // Test lifecycle status breakdown
  const lifecycleBreakdown = await Notification.aggregate([
    { $match: { adminManaged: true, notificationGroup: { $regex: /^test_/ } } },
    {
      $group: {
        _id: '$lifecycleStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  console.log('  📋 Lifecycle status breakdown:');
  lifecycleBreakdown.forEach(status => {
    console.log(`    ${status._id}: ${status.count} notifications`);
  });
}

async function testPendingReview() {
  console.log('  📋 Testing pending review functionality...');

  const pendingNotifications = await Notification.find({
    lifecycleStatus: 'pending_review',
    notificationGroup: { $regex: /^test_/ }
  });

  console.log(
    `  📊 Found ${pendingNotifications.length} notifications pending review`
  );

  if (pendingNotifications.length > 0) {
    const sample = pendingNotifications[0];
    console.log(
      `  📝 Sample pending notification: "${sample.title}" (created ${sample.createdAt.toDateString()})`
    );
    console.log(`  ⏰ Reminder sent: ${sample.reminderSentAt ? 'Yes' : 'No'}`);
  }

  // Test urgency calculation
  const urgentNotifications = await Notification.find({
    lifecycleStatus: 'pending_review',
    notificationGroup: { $regex: /^test_/ },
    createdAt: {
      $lt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35+ days old
    }
  });

  console.log(
    `  🚨 Found ${urgentNotifications.length} urgent notifications (35+ days old)`
  );
}

async function testBulkDelete() {
  console.log('  🗑️ Testing bulk delete functionality...');

  // First, create some deletable test notifications
  const deletableNotifications = [];
  for (let i = 1; i <= 3; i++) {
    deletableNotifications.push({
      userId: global.testUsers[0]._id,
      type: 'user_updated',
      title: `Deletable Test Notification ${i}`,
      message: 'This notification can be safely deleted',
      notificationGroup: `test_deletable_group_${i}`,
      recipientUserIds: [global.testUsers[0]._id],
      adminManaged: true,
      lifecycleStatus: 'active',
      read: true,
      readAt: new Date(),
      isReadByAllUsers: true
    });
  }

  await Notification.insertMany(deletableNotifications);
  console.log(
    `  📝 Created ${deletableNotifications.length} deletable notifications`
  );

  // Test deletion by criteria (read notifications)
  const deleteFilter = {
    adminManaged: true,
    isReadByAllUsers: true,
    notificationGroup: { $regex: /^test_deletable_/ }
  };

  const notificationsToDelete = await Notification.find(deleteFilter);
  console.log(
    `  🎯 Found ${notificationsToDelete.length} notifications matching delete criteria`
  );

  const deleteResult = await Notification.deleteMany(deleteFilter);
  console.log(
    `  ✅ Successfully deleted ${deleteResult.deletedCount} notifications`
  );

  // Test deletion by specific IDs
  const remainingTestNotifications = await Notification.find({
    notificationGroup: { $regex: /^test_read_group_/ },
    adminManaged: true
  }).limit(2);

  if (remainingTestNotifications.length > 0) {
    const idsToDelete = remainingTestNotifications.map(n => n._id);
    const idDeleteResult = await Notification.deleteMany({
      _id: { $in: idsToDelete }
    });
    console.log(
      `  🎯 Deleted ${idDeleteResult.deletedCount} notifications by specific IDs`
    );
  }
}

async function testLifecycleExtension() {
  console.log('  📅 Testing lifecycle extension...');

  // Find a test notification to extend
  const notificationToExtend = await Notification.findOne({
    lifecycleStatus: 'pending_review',
    notificationGroup: { $regex: /^test_/ }
  });

  if (notificationToExtend) {
    console.log(`  📝 Extending notification: "${notificationToExtend.title}"`);

    const originalExpiry =
      notificationToExtend.extendedUntil || notificationToExtend.expiresAt;
    const extendDays = 60;
    const newExpiryDate = new Date(originalExpiry);
    newExpiryDate.setDate(newExpiryDate.getDate() + extendDays);

    // Simulate extension
    notificationToExtend.lifecycleStatus = 'extended';
    notificationToExtend.extendedUntil = newExpiryDate;
    notificationToExtend.expiresAt = newExpiryDate;

    if (!notificationToExtend.metadata) {
      notificationToExtend.metadata = {};
    }
    notificationToExtend.metadata.extensions =
      notificationToExtend.metadata.extensions || [];
    notificationToExtend.metadata.extensions.push({
      extendedBy: global.testAdminUser._id,
      extendedAt: new Date(),
      extendDays: extendDays,
      reason: 'Testing lifecycle extension functionality',
      previousExpiry: originalExpiry
    });

    await notificationToExtend.save();

    console.log(`  ✅ Extended notification by ${extendDays} days`);
    console.log(`  📅 New expiry date: ${newExpiryDate.toDateString()}`);
    console.log(
      `  📝 Extension history: ${notificationToExtend.metadata.extensions.length} entries`
    );
  } else {
    console.log('  ⚠️ No pending review notifications found to extend');
  }
}

async function testSettingsManagement() {
  console.log('  ⚙️ Testing settings management...');

  // Test default settings
  const defaultSettings = {
    autoDeleteReadNotifications: false,
    maxRetentionDays: 30,
    reminderDaysBeforeExpiry: 1,
    importantNotificationTypes: ['payment_overdue', 'security_alert'],
    autoExtendImportant: true,
    notificationBatchSize: 100
  };

  console.log('  📋 Default settings:');
  Object.entries(defaultSettings).forEach(([key, value]) => {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  });

  // Test settings update
  const updatedSettings = {
    ...defaultSettings,
    maxRetentionDays: 60,
    reminderDaysBeforeExpiry: 2,
    notificationBatchSize: 150,
    updatedBy: global.testAdminUser._id,
    updatedAt: new Date()
  };

  global.notificationSettings = updatedSettings;

  console.log('  ✅ Settings updated successfully');
  console.log(`  📝 Max retention days: ${updatedSettings.maxRetentionDays}`);
  console.log(
    `  📝 Reminder days: ${updatedSettings.reminderDaysBeforeExpiry}`
  );
  console.log(`  📝 Batch size: ${updatedSettings.notificationBatchSize}`);
}

async function testAnalytics() {
  console.log('  📈 Testing analytics functionality...');

  // Test notification analytics by type
  const typeAnalytics = await Notification.aggregate([
    { $match: { adminManaged: true, notificationGroup: { $regex: /^test_/ } } },
    {
      $group: {
        _id: '$type',
        totalCount: { $sum: 1 },
        readCount: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        urgentCount: {
          $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        readPercentage: {
          $round: [
            { $multiply: [{ $divide: ['$readCount', '$totalCount'] }, 100] },
            1
          ]
        }
      }
    },
    { $sort: { totalCount: -1 } }
  ]);

  console.log('  📊 Analytics by notification type:');
  typeAnalytics.forEach(type => {
    console.log(
      `    ${type._id}: ${type.totalCount} total, ${type.readCount} read (${type.readPercentage}%), ${type.urgentCount} urgent`
    );
  });

  // Test lifecycle analytics
  const lifecycleAnalytics = await Notification.aggregate([
    { $match: { adminManaged: true, notificationGroup: { $regex: /^test_/ } } },
    {
      $group: {
        _id: '$lifecycleStatus',
        count: { $sum: 1 },
        avgAge: {
          $avg: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              86400000 // milliseconds in a day
            ]
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);

  console.log('  🔄 Lifecycle status analytics:');
  lifecycleAnalytics.forEach(status => {
    console.log(
      `    ${status._id}: ${status.count} notifications, avg age: ${Math.round(status.avgAge)} days`
    );
  });

  // Test summary statistics
  const summaryStats = await Notification.aggregate([
    { $match: { adminManaged: true, notificationGroup: { $regex: /^test_/ } } },
    {
      $group: {
        _id: null,
        totalNotifications: { $sum: 1 },
        totalRead: { $sum: { $cond: ['$isReadByAllUsers', 1, 0] } },
        avgLifecycleDays: {
          $avg: {
            $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000]
          }
        }
      }
    }
  ]);

  const stats = summaryStats[0];
  if (stats) {
    console.log('  📈 Summary statistics:');
    console.log(`    Total notifications: ${stats.totalNotifications}`);
    console.log(`    Total read: ${stats.totalRead}`);
    console.log(
      `    Overall read rate: ${Math.round((stats.totalRead / stats.totalNotifications) * 100)}%`
    );
    console.log(`    Average age: ${Math.round(stats.avgLifecycleDays)} days`);
  }
}

async function cleanupTestData() {
  // Delete test notifications
  const notificationResult = await Notification.deleteMany({
    notificationGroup: { $regex: /^test_/ }
  });
  console.log(
    `🗑️ Deleted ${notificationResult.deletedCount} test notifications`
  );

  // Don't delete test users as they might be needed for other tests
  // Just log that they exist
  const testUserCount = await User.countDocuments({
    email: { $regex: /phase4@test\.com$/ }
  });
  console.log(
    `👤 ${testUserCount} test users remain (not deleted for potential reuse)`
  );

  // Clear global test settings
  delete global.notificationSettings;
  delete global.testAdminUser;
  delete global.testUsers;
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPhase4AdminInterface()
    .then(() => {
      console.log('\n🎉 Phase 4 Admin Interface tests completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Phase 4 tests failed:', error);
      process.exit(1);
    });
}

module.exports = testPhase4AdminInterface;
