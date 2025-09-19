/**
 * Migration: Notification Schema Update
 * Updates existing notifications to include new fields for admin-controlled lifecycle management
 */

const mongoose = require('mongoose');

const migration = {
  name: '001_notification_schema_update',
  description: 'Add new fields for notification lifecycle management',

  async up(db) {
    console.log('Starting notification schema migration...');

    try {
      const collection = db.collection('notifications');

      // Get count of existing notifications
      const existingCount = await collection.countDocuments();
      console.log(`Found ${existingCount} existing notifications to migrate`);

      if (existingCount === 0) {
        console.log('No existing notifications found, migration complete');
        return;
      }

      // Update all existing notifications with new fields
      const updateResult = await collection.updateMany(
        {}, // Match all documents
        {
          $set: {
            // Set default values for new fields
            adminManaged: true,
            lifecycleStatus: 'active',
            isReadByAllUsers: false,
            readByUsers: [],
            // Generate notification group based on existing data
            notificationGroup: {
              $concat: [
                { $ifNull: ['$type', 'unknown'] },
                '_',
                {
                  $dateToString: {
                    format: '%Y_%m_%d',
                    date: { $ifNull: ['$createdAt', new Date()] }
                  }
                },
                '_legacy'
              ]
            }
          },
          // Set recipientUserIds to array containing current userId
          $addToSet: {
            recipientUserIds: '$userId'
          },
          // Update expiresAt to be 30 days from creation if not set
          $setOnInsert: {
            expiresAt: {
              $add: [
                { $ifNull: ['$createdAt', new Date()] },
                30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
              ]
            }
          }
        }
      );

      console.log(`Updated ${updateResult.modifiedCount} notifications`);

      // Handle notifications that already have readAt but need readByUsers populated
      const readNotifications = await collection
        .find({
          read: true,
          readAt: { $exists: true },
          'readByUsers.0': { $exists: false } // No readByUsers entries yet
        })
        .toArray();

      console.log(
        `Found ${readNotifications.length} read notifications to update readByUsers`
      );

      // Update readByUsers for notifications that have been read
      for (const notification of readNotifications) {
        await collection.updateOne(
          { _id: notification._id },
          {
            $push: {
              readByUsers: {
                userId: notification.userId,
                readAt:
                  notification.readAt ||
                  notification.updatedAt ||
                  notification.createdAt
              }
            },
            $set: {
              isReadByAllUsers: true // Since it's read by the only recipient
            }
          }
        );
      }

      // Create indexes for new fields
      console.log('Creating indexes for new fields...');

      const indexes = [
        { notificationGroup: 1 },
        { recipientUserIds: 1 },
        { lifecycleStatus: 1, expiresAt: 1 },
        { reminderSentAt: 1 },
        { extendedUntil: 1 },
        { isReadByAllUsers: 1 }
      ];

      for (const index of indexes) {
        try {
          await collection.createIndex(index);
          console.log('Created index:', index);
        } catch (error) {
          console.log('Index may already exist:', index, error.message);
        }
      }

      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(db) {
    console.log('Rolling back notification schema migration...');

    try {
      const collection = db.collection('notifications');

      // Remove the new fields
      const updateResult = await collection.updateMany(
        {},
        {
          $unset: {
            notificationGroup: '',
            recipientUserIds: '',
            readByUsers: '',
            isReadByAllUsers: '',
            adminManaged: '',
            lifecycleStatus: '',
            reminderSentAt: '',
            extendedUntil: ''
          }
        }
      );

      console.log(
        `Removed new fields from ${updateResult.modifiedCount} notifications`
      );

      // Drop the new indexes
      const indexesToDrop = [
        'notificationGroup_1',
        'recipientUserIds_1',
        'lifecycleStatus_1_expiresAt_1',
        'reminderSentAt_1',
        'extendedUntil_1',
        'isReadByAllUsers_1'
      ];

      for (const indexName of indexesToDrop) {
        try {
          await collection.dropIndex(indexName);
          console.log(`Dropped index: ${indexName}`);
        } catch (error) {
          console.log(`Index may not exist: ${indexName}`);
        }
      }

      console.log('Rollback completed successfully');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
};

module.exports = migration;
