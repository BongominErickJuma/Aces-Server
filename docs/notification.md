# Notification Management System Documentation

## Overview
This document outlines the implementation of an admin-controlled notification management system with automatic 30-day lifecycle management.

## Current Status
- ✅ Basic notification system implemented
- 🔄 **IN PROGRESS**: Admin-controlled lifecycle management
- ⏳ **TODO**: 30-day reminder system
- ⏳ **TODO**: Bulk management features

## System Architecture

### 1. Notification Lifecycle (30-Day Rule)
```
Day 0:    Notification created
Day 1-29: Normal notification display
Day 30:   Auto-reminder sent to admin
Day 31+:  Admin must take action (extend/delete)
```

### 2. Database Schema Changes

#### Notification Model Updates
```javascript
// NEW FIELDS TO ADD:
notificationGroup: {
  type: String, // Unique identifier for grouped notifications
  required: true,
  index: true
},
recipientUserIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true
}], // Track who should receive this notification
readByUsers: [{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  readAt: {
    type: Date,
    default: Date.now
  }
}], // Track who has read it
isReadByAllUsers: {
  type: Boolean,
  default: false,
  index: true
},
adminManaged: {
  type: Boolean,
  default: true
},
lifecycleStatus: {
  type: String,
  enum: ['active', 'pending_review', 'extended', 'archived'],
  default: 'active',
  index: true
},
reminderSentAt: {
  type: Date,
  index: true
},
extendedUntil: {
  type: Date,
  index: true
},
// KEEP EXISTING expiresAt but modify its behavior
expiresAt: {
  type: Date,
  default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  index: true
}
```

### 3. Implementation Steps

#### Phase 1: Database Schema Updates
- [ ] **Step 1.1**: Update Notification model with new fields
- [ ] **Step 1.2**: Create migration script for existing notifications
- [ ] **Step 1.3**: Update notification creation logic

#### Phase 2: Read Tracking System
- [ ] **Step 2.1**: Modify notification creation to store `recipientUserIds`
- [ ] **Step 2.2**: Update read notification endpoint to track `readByUsers`
- [ ] **Step 2.3**: Add logic to calculate `isReadByAllUsers`
- [ ] **Step 2.4**: Create background job to update read status

#### Phase 3: 30-Day Lifecycle Management
- [ ] **Step 3.1**: Create daily cron job to check notification ages
- [ ] **Step 3.2**: Implement reminder notification to admin at day 30
- [ ] **Step 3.3**: Update notification status to `pending_review`
- [ ] **Step 3.4**: Prevent auto-deletion after day 30 (admin action required)

#### Phase 4: Admin Management Interface
- [ ] **Step 4.1**: Create admin notification summary endpoint
- [ ] **Step 4.2**: Create bulk delete endpoint for read notifications
- [ ] **Step 4.3**: Create extend lifecycle endpoint
- [ ] **Step 4.4**: Create notification settings endpoint

#### Phase 5: Auto-Cleanup & Optimization
- [ ] **Step 5.1**: Implement configurable auto-cleanup rules
- [ ] **Step 5.2**: Add notification archiving system
- [ ] **Step 5.3**: Create notification analytics for admin

### 4. New API Endpoints

#### Admin Notification Management
```javascript
// GET /api/admin/notifications/summary
// Returns: notification groups with read status and lifecycle info

// GET /api/admin/notifications/pending-review
// Returns: notifications requiring admin action (30+ days old)

// DELETE /api/admin/notifications/bulk-delete
// Body: { notificationIds: [], criteria: {} }

// PUT /api/admin/notifications/:id/extend
// Body: { extendDays: 30, reason: "Important for audit" }

// PUT /api/admin/notifications/settings
// Body: { autoDeleteAfterRead: true, maxRetentionDays: 90 }
```

#### Enhanced User Endpoints
```javascript
// PUT /api/notifications/:id/read (UPDATED)
// Now tracks readByUsers and updates isReadByAllUsers

// GET /api/notifications (UPDATED)
// Now includes read status and lifecycle info
```

### 5. Background Jobs

#### Daily Lifecycle Check
```javascript
// Runs every day at 2 AM
async function checkNotificationLifecycle() {
  // 1. Find notifications approaching 30 days
  // 2. Send reminder to admin
  // 3. Update status to 'pending_review'
  // 4. Log actions taken
}
```

#### Read Status Calculator
```javascript
// Runs every hour
async function updateReadStatus() {
  // 1. Find notifications with unprocessed reads
  // 2. Calculate if all recipients have read
  // 3. Update isReadByAllUsers flag
  // 4. Trigger any auto-cleanup if configured
}
```

### 6. Notification Grouping Strategy

#### Group ID Generation
```javascript
// Examples:
'user_created_2024_12_18'     // All user creation notifications for a day
'quotation_12345_lifecycle'   // All notifications for quotation 12345
'payment_overdue_batch_001'   // Batch of overdue payment notifications
```

#### Benefits of Grouping
- Admin can manage related notifications together
- Easier to extend/delete bulk notifications
- Better analytics and reporting
- Reduced database queries

### 7. Configuration System

#### Admin Settings
```javascript
{
  autoDeleteReadNotifications: false,
  maxRetentionDays: 30,
  reminderDaysBeforeExpiry: 1,
  importantNotificationTypes: ['payment_overdue', 'security_alert'],
  autoExtendImportant: true,
  notificationBatchSize: 100
}
```

### 8. Implementation Priority

#### High Priority (Immediate)
1. Database schema updates
2. Read tracking system
3. 30-day reminder system

#### Medium Priority (Phase 2)
1. Admin management endpoints
2. Bulk operations
3. Notification grouping

#### Low Priority (Future)
1. Advanced analytics
2. Custom retention policies
3. Notification templates

### 9. Testing Strategy

#### Unit Tests
- [ ] Notification model validation
- [ ] Read tracking logic
- [ ] Lifecycle calculation
- [ ] Group ID generation

#### Integration Tests
- [ ] Notification creation flow
- [ ] Read status updates
- [ ] Admin bulk operations
- [ ] Background job execution

#### Performance Tests
- [ ] Large notification datasets
- [ ] Bulk operations performance
- [ ] Database query optimization

### 10. Migration Plan

#### For Existing Notifications
```javascript
// Migration script to:
1. Add recipientUserIds based on current userId
2. Generate notificationGroup IDs
3. Set initial lifecycleStatus
4. Calculate initial expiresAt dates
5. Preserve existing read status
```

### 11. Monitoring & Alerts

#### Metrics to Track
- Daily notification creation rate
- Read rate by notification type
- Admin action rate on pending reviews
- Database storage usage
- Background job performance

#### Alerts
- High notification creation rate
- Low read rates
- Failed background jobs
- Approaching storage limits

---

## Next Steps

1. **Start Implementation**: Begin with Phase 1 (Database Schema Updates)
2. **Create Migration**: Ensure existing data is preserved
3. **Test Thoroughly**: Each phase should be tested before moving to next
4. **Monitor Performance**: Track database impact during implementation
5. **Admin Training**: Document new admin features for end users

---

## Files to Modify/Create

### Backend Files
- `src/models/Notification.model.js` (UPDATE)
- `src/controllers/notification.controller.js` (UPDATE)
- `src/controllers/admin/notification.controller.js` (CREATE)
- `src/services/notification.service.js` (UPDATE)
- `src/services/notificationLifecycle.service.js` (CREATE)
- `src/jobs/notificationCleanup.job.js` (CREATE)
- `src/routes/admin/notification.routes.js` (CREATE)

### Migration Files
- `src/migrations/001_notification_schema_update.js` (CREATE)

### Test Files
- `tests/notification.lifecycle.test.js` (CREATE)
- `tests/admin.notification.test.js` (CREATE)

---

*Last Updated: 2024-12-18*
*Next Review: After Phase 1 completion*