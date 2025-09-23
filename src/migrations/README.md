# Database Migrations

This directory contains database migration scripts for the Aces Movers application.

## Available Migrations

### 002_update_box_to_item.js

**Purpose**: Updates all BOX receipt types to ITEM receipt types.

**What it does**:
- Changes `receiptType` field from "box" to "item" in all receipts
- Updates `receiptNumber` prefix from "AMRC-BOX-XXXXX" to "AMRC-ITM-XXXXX"
- Migrates counter collection from "box_receipt" to "item_receipt"
- Updates counter prefix from "BOX" to "ITM"

**When to run**: After updating the codebase to use "item" instead of "box" receipt types.

## How to Run Migrations

### Prerequisites
1. Ensure you have a backup of your database
2. Set up your environment variables (MONGODB_URI)
3. Stop your application server

### Running the BOX-to-ITEM Migration

```bash
# Navigate to migrations directory
cd backend/src/migrations

# Run the migration
node run-migration.js box-to-item

# Or run the migration directly
node 002_update_box_to_item.js
```

### Rolling Back the Migration

If you need to revert the changes:

```bash
# Rollback the migration
node run-migration.js box-to-item rollback

# Or run rollback directly
node 002_update_box_to_item.js rollback
```

## Migration Safety

### Before Running
- ✅ Create a database backup
- ✅ Test on a staging environment first
- ✅ Verify environment variables are set correctly
- ✅ Ensure no application instances are running

### After Running
- ✅ Verify the migration results in the logs
- ✅ Check that no "box" records remain
- ✅ Test application functionality
- ✅ Monitor for any issues

## Verification

The migration script includes built-in verification that will show:
- Number of receipts updated
- Number of receipt numbers updated
- Counter migration status
- Final counts of box vs item records

### Manual Verification

You can also manually verify the migration:

```javascript
// Connect to your MongoDB and run these queries

// Should return 0
db.receipts.countDocuments({receiptType: "box"})

// Should return count of converted receipts
db.receipts.countDocuments({receiptType: "item"})

// Should return 0
db.receipts.countDocuments({receiptNumber: /^AMRC-BOX-/})

// Should return count of converted receipt numbers
db.receipts.countDocuments({receiptNumber: /^AMRC-ITM-/})

// Should return 0
db.counters.countDocuments({_id: "box_receipt"})

// Should return 1 if any box receipts existed
db.counters.countDocuments({_id: "item_receipt"})

// Should return 0
db.counters.countDocuments({prefix: "BOX"})
```

## Troubleshooting

### Common Issues

1. **Connection Error**: Ensure MONGODB_URI is set correctly
2. **Permission Error**: Ensure database user has write permissions
3. **Partial Migration**: Check logs for specific errors and re-run if safe

### Getting Help

If the migration fails:
1. Check the error logs
2. Restore from backup if necessary
3. Report the issue with full error details

## Environment Variables

Required environment variables:
- `MONGODB_URI`: Your MongoDB connection string
- `NODE_ENV`: Set to appropriate environment

Example `.env`:
```
MONGODB_URI=mongodb://localhost:27017/aces-movers
NODE_ENV=development
```