/**
 * Counter Model
 * Handles sequential numbering for quotations and receipts
 */

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
      // Format: "quotation_2024", "receipt_2024", "box_receipt_2024", etc.
    },
    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Sequence cannot be negative']
    },
    prefix: {
      type: String,
      required: true,
      trim: true
      // E.g., "QTN", "RCP", "BOX", "COM", "FIN", "OTP"
    },
    year: {
      type: Number,
      required: true,
      min: [2020, 'Year must be valid'],
      max: [2099, 'Year must be valid']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [100, 'Description cannot exceed 100 characters']
    },
    lastUsed: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
counterSchema.index({ year: 1, prefix: 1 });
counterSchema.index({ lastUsed: 1 });

// Virtual for formatted counter ID
counterSchema.virtual('formattedId').get(function () {
  return `${this.prefix}-${this.year}-${String(this.sequence).padStart(4, '0')}`;
});

// Virtual for next number
counterSchema.virtual('nextNumber').get(function () {
  return this.sequence + 1;
});

// Static method to get next sequence number
counterSchema.statics.getNextSequence = async function (type, year = null) {
  if (!year) {
    year = new Date().getFullYear();
  }

  // Determine prefix and counter ID
  const prefixMap = {
    quotation: 'QTN',
    box_receipt: 'BOX',
    commitment_receipt: 'COM',
    final_receipt: 'FIN',
    one_time_receipt: 'OTP',
    receipt: 'RCP' // Generic receipt
  };

  const prefix = prefixMap[type] || 'DOC';
  const counterId = `${type}_${year}`;

  const counter = await this.findOneAndUpdate(
    { _id: counterId },
    {
      $inc: { sequence: 1 },
      $set: {
        prefix,
        year,
        lastUsed: new Date(),
        description: `${type.replace('_', ' ')} counter for ${year}`
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return {
    sequence: counter.sequence,
    formattedNumber: `${prefix}-${year}-${String(counter.sequence).padStart(4, '0')}`,
    counterId: counter._id
  };
};

// Static method to reset counter for new year
counterSchema.statics.resetYearlyCounters = async function (year = null) {
  if (!year) {
    year = new Date().getFullYear();
  }

  const counterTypes = [
    'quotation',
    'box_receipt',
    'commitment_receipt',
    'final_receipt',
    'one_time_receipt',
    'receipt'
  ];

  const results = [];

  for (const type of counterTypes) {
    const counterId = `${type}_${year}`;

    // Only create if doesn't exist
    const existing = await this.findById(counterId);
    if (!existing) {
      const prefixMap = {
        quotation: 'QTN',
        box_receipt: 'BOX',
        commitment_receipt: 'COM',
        final_receipt: 'FIN',
        one_time_receipt: 'OTP',
        receipt: 'RCP'
      };

      const counter = new this({
        _id: counterId,
        sequence: 0,
        prefix: prefixMap[type],
        year,
        description: `${type.replace('_', ' ')} counter for ${year}`
      });

      await counter.save();
      results.push(counter);
    }
  }

  return results;
};

// Static method to get current counts by year
counterSchema.statics.getYearlyStats = async function (year = null) {
  if (!year) {
    year = new Date().getFullYear();
  }

  return await this.find({ year }).sort({ prefix: 1 });
};

// Static method to get all-time stats
counterSchema.statics.getAllTimeStats = async function () {
  return await this.aggregate([
    {
      $group: {
        _id: '$prefix',
        totalCount: { $sum: '$sequence' },
        years: { $addToSet: '$year' },
        lastUsed: { $max: '$lastUsed' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Instance method to increment counter
counterSchema.methods.increment = function () {
  this.sequence += 1;
  this.lastUsed = new Date();
  return this.save();
};

// Instance method to reset counter
counterSchema.methods.reset = function () {
  this.sequence = 0;
  this.lastUsed = new Date();
  return this.save();
};

// Instance method to set sequence
counterSchema.methods.setSequence = function (newSequence) {
  if (newSequence < 0) {
    throw new Error('Sequence cannot be negative');
  }

  this.sequence = newSequence;
  this.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('Counter', counterSchema);
