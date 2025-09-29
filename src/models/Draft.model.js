const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['quotation-create', 'receipt-create'],
    index: true
  },
  title: {
    type: String,
    default: 'Untitled Draft',
    maxlength: 100
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  lastModified: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for efficient user draft queries
draftSchema.index({ userId: 1, type: 1 });

// Ensure only one draft per type per user
draftSchema.index({ userId: 1, type: 1 }, { unique: true });

// Method to update last modified
draftSchema.methods.updateLastModified = function() {
  this.lastModified = new Date();
  return this.save();
};

// Static method to find or create draft for user
draftSchema.statics.findOrCreateDraft = async function(userId, type, data = {}) {
  let draft = await this.findOne({ userId, type });

  if (!draft) {
    draft = new this({
      userId,
      type,
      data
    });
    await draft.save();
  }

  return draft;
};

module.exports = mongoose.model('Draft', draftSchema);