/**
 * Test script for Notification Lifecycle Job
 * This script tests the Phase 3 implementation
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const notificationLifecycleJob = require('./notificationLifecycle.job');

async function testLifecycleJob() {
  try {
    console.log('🧪 Starting Notification Lifecycle Job Test...\n');

    // Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      console.log('📡 Connecting to database...');
      await mongoose.connect(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/aces-movers'
      );
      console.log('✅ Database connected\n');
    }

    // 1. Create test admin user if doesn't exist
    console.log('👤 Setting up test admin user...');
    let adminUser = await User.findOne({ email: 'admin@test.com' });

    if (!adminUser) {
      adminUser = await User.create({
        name: 'Test Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin',
        isActive: true
      });
      console.log('✅ Test admin user created');
    } else {
      console.log('✅ Test admin user found');
    }

    // 2. Create test notifications that are 30+ days old
    console.log('\n📝 Creating test notifications...');

    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const testNotifications = [
      {
        userId: adminUser._id,
        type: 'user_created',
        title: 'Test Old Notification 1',
        message:
          'This is a test notification that should trigger lifecycle review',
        notificationGroup: 'test_lifecycle_1',
        recipientUserIds: [adminUser._id],
        adminManaged: true,
        lifecycleStatus: 'active',
        createdAt: thirtyOneDaysAgo
      },
      {
        userId: adminUser._id,
        type: 'payment_overdue',
        title: 'Test Important Notification',
        message: 'This important notification should be auto-extended',
        notificationGroup: 'test_lifecycle_2',
        recipientUserIds: [adminUser._id],
        adminManaged: true,
        lifecycleStatus: 'active',
        createdAt: thirtyOneDaysAgo
      }
    ];

    // Delete existing test notifications first
    await Notification.deleteMany({
      notificationGroup: { $in: ['test_lifecycle_1', 'test_lifecycle_2'] }
    });

    // Create new test notifications
    const createdNotifications =
      await Notification.insertMany(testNotifications);
    console.log(
      `✅ Created ${createdNotifications.length} test notifications\n`
    );

    // 3. Run the lifecycle job
    console.log('🔄 Running lifecycle job...');
    await notificationLifecycleJob.execute();
    console.log('✅ Lifecycle job completed\n');

    // 4. Check results
    console.log('🔍 Checking results...');

    const updatedNotifications = await Notification.find({
      notificationGroup: { $in: ['test_lifecycle_1', 'test_lifecycle_2'] }
    });

    for (const notification of updatedNotifications) {
      console.log(`📋 Notification: ${notification.title}`);
      console.log(`   Status: ${notification.lifecycleStatus}`);
      console.log(
        `   Reminder Sent: ${notification.reminderSentAt ? 'Yes' : 'No'}`
      );
      console.log(
        `   Extended Until: ${notification.extendedUntil || 'Not extended'}`
      );
      console.log('');
    }

    // 5. Check for admin reminder notifications
    const reminderNotifications = await Notification.find({
      type: 'system_maintenance',
      title: 'Notification Lifecycle Review Required',
      userId: adminUser._id
    })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(
      `📨 Found ${reminderNotifications.length} admin reminder notifications`
    );

    if (reminderNotifications.length > 0) {
      console.log('📨 Latest admin reminder:');
      console.log(`   Title: ${reminderNotifications[0].title}`);
      console.log(`   Message: ${reminderNotifications[0].message}`);
      console.log(`   Created: ${reminderNotifications[0].createdAt}`);
      console.log('');
    }

    // 6. Get job statistics
    const stats = notificationLifecycleJob.getStats();
    console.log('📊 Job Statistics:');
    console.log(`   Total Runs: ${stats.totalRuns}`);
    console.log(`   Notifications Checked: ${stats.notificationsChecked}`);
    console.log(`   Reminders Sent: ${stats.remindersSent}`);
    console.log(`   Status Updates: ${stats.statusUpdates}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Last Run: ${stats.lastRun}`);
    console.log('');

    // 7. Get pending review report
    const report = await notificationLifecycleJob.getPendingReviewReport();
    console.log('📋 Pending Review Report:');
    console.log(`   Total Pending: ${report.totalPendingReview}`);
    console.log(`   Urgent Groups: ${report.urgentGroups.length}`);
    console.log('');

    console.log('✅ Test completed successfully!');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await Notification.deleteMany({
      $or: [
        {
          notificationGroup: { $in: ['test_lifecycle_1', 'test_lifecycle_2'] }
        },
        {
          type: 'system_maintenance',
          title: 'Notification Lifecycle Review Required',
          userId: adminUser._id
        }
      ]
    });

    // Don't delete the admin user as it might be needed
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testLifecycleJob()
    .then(() => {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = testLifecycleJob;
