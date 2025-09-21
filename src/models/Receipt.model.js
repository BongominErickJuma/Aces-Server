/**
 * Receipt Model
 * Handles receipt data, payment tracking, and versioning
 */

const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^AMRC-(RCP|BOX|COM|FIN|OTP)-\d{5}$/,
        'Receipt number must follow format AMRC-PREFIX-NNNNN'
      ]
    },
    receiptType: {
      type: String,
      required: [true, 'Receipt type is required'],
      enum: {
        values: ['box', 'commitment', 'final', 'one_time'],
        message: 'Receipt type must be box, commitment, final, or one_time'
      }
    },
    moveType: {
      type: String,
      enum: {
        values: ['international', 'residential', 'office'],
        message: 'Move type must be international, residential, or office'
      }
      // Optional - not required for box receipts
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation'
      // Optional - receipts can be created independently
    },
    client: {
      name: {
        type: String,
        required: [true, 'Client name is required'],
        trim: true,
        maxlength: [100, 'Client name cannot exceed 100 characters']
      },
      phone: {
        type: String,
        required: [true, 'Client phone is required'],
        trim: true,
        match: [/^[+]?[\d\s\-()]{10,}$/, 'Please provide a valid phone number']
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [
          /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
          'Please provide a valid email'
        ]
      },
      address: {
        type: String,
        trim: true,
        maxlength: [500, 'Address cannot exceed 500 characters']
      }
    },
    // For commitment, final, and one_time receipts
    locations: {
      from: {
        type: String,
        trim: true,
        maxlength: [300, 'Pickup location cannot exceed 300 characters']
      },
      to: {
        type: String,
        trim: true,
        maxlength: [300, 'Destination location cannot exceed 300 characters']
      },
      movingDate: {
        type: Date
      }
    },
    services: [
      {
        description: {
          type: String,
          required: [true, 'Service description is required'],
          trim: true,
          maxlength: [500, 'Service description cannot exceed 500 characters']
        },
        amount: {
          type: Number,
          required: [true, 'Service amount is required'],
          min: [0, 'Amount cannot be negative']
        },
        quantity: {
          type: Number,
          default: 1,
          min: [1, 'Quantity must be at least 1']
        },
        total: {
          type: Number,
          required: [true, 'Service total is required'],
          min: [0, 'Total cannot be negative']
        }
      }
    ],
    payment: {
      totalAmount: {
        type: Number,
        required: [true, 'Total amount is required'],
        min: [0, 'Total amount cannot be negative']
      },
      amountPaid: {
        type: Number,
        default: 0,
        min: [0, 'Amount paid cannot be negative']
      },
      balance: {
        type: Number,
        default: function () {
          return this.payment.totalAmount - this.payment.amountPaid;
        },
        min: [0, 'Balance cannot be negative']
      },
      currency: {
        type: String,
        required: [true, 'Currency is required'],
        enum: {
          values: ['UGX', 'USD'],
          message: 'Currency must be UGX or USD'
        },
        default: 'UGX'
      },
      status: {
        type: String,
        enum: {
          values: [
            'pending',
            'partial',
            'paid',
            'overdue',
            'refunded',
            'cancelled'
          ],
          message:
            'Status must be pending, partial, paid, overdue, refunded, or cancelled'
        },
        default: 'pending'
      },
      method: {
        type: String,
        enum: {
          values: ['cash', 'bank_transfer', 'mobile_money'],
          message: 'Method must be cash, bank_transfer, or mobile_money'
        }
      },
      dueDate: {
        type: Date
      },
      paymentHistory: [
        {
          amount: {
            type: Number,
            required: true,
            min: [0, 'Payment amount cannot be negative']
          },
          date: {
            type: Date,
            default: Date.now,
            required: true
          },
          method: {
            type: String,
            required: true,
            enum: ['cash', 'bank_transfer', 'mobile_money']
          },
          reference: {
            type: String,
            trim: true,
            maxlength: [100, 'Reference cannot exceed 100 characters']
          },
          receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
          },
          notes: {
            type: String,
            trim: true,
            maxlength: [200, 'Payment notes cannot exceed 200 characters']
          }
        }
      ]
    },
    signatures: {
      receivedBy: {
        type: String,
        trim: true,
        maxlength: [100, 'Received by name cannot exceed 100 characters']
      },
      receivedByTitle: {
        type: String,
        trim: true,
        maxlength: [50, 'Title cannot exceed 50 characters']
      },
      clientName: {
        type: String,
        trim: true,
        maxlength: [100, 'Client name cannot exceed 100 characters']
      },
      signatureDate: {
        type: Date,
        default: Date.now
      }
    },
    // For storing specific amounts based on receipt type
    commitmentFeePaid: {
      type: Number,
      min: [0, 'Commitment fee cannot be negative']
    },
    totalMovingAmount: {
      type: Number,
      min: [0, 'Total moving amount cannot be negative']
    },
    finalPaymentReceived: {
      type: Number,
      min: [0, 'Final payment cannot be negative']
    },
    // For final receipts - reference to commitment receipt
    commitmentFee: {
      commitmentReceiptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Receipt'
      },
      amount: {
        type: Number,
        min: [0, 'Commitment fee cannot be negative']
      },
      paidDate: {
        type: Date
      }
    },
    version: {
      type: Number,
      default: 1,
      min: [1, 'Version must be at least 1']
    },
    versions: [
      {
        versionNumber: {
          type: Number,
          required: true
        },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        editedAt: {
          type: Date,
          default: Date.now
        },
        changes: {
          type: mongoose.Schema.Types.Mixed // Store field changes
        },
        reason: {
          type: String,
          trim: true,
          maxlength: [200, 'Edit reason cannot exceed 200 characters']
        }
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator is required']
    },
    pdfUrl: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
receiptSchema.index({ receiptNumber: 1 });
receiptSchema.index({ receiptType: 1 });
receiptSchema.index({ createdBy: 1 });
receiptSchema.index({ createdAt: -1 });
receiptSchema.index({ quotationId: 1 });
receiptSchema.index({ 'payment.status': 1 });
receiptSchema.index({ 'payment.dueDate': 1 });
receiptSchema.index({ 'client.name': 'text' }); // Text search

// Compound indexes
receiptSchema.index({ createdBy: 1, createdAt: -1 });
receiptSchema.index({ receiptType: 1, createdAt: -1 });
receiptSchema.index({ 'payment.status': 1, 'payment.dueDate': 1 });

// Virtual for checking if payment is overdue
receiptSchema.virtual('isOverdue').get(function () {
  return (
    this.payment.dueDate &&
    this.payment.dueDate < new Date() &&
    this.payment.status !== 'paid'
  );
});

// Virtual for days overdue
receiptSchema.virtual('daysOverdue').get(function () {
  if (!this.isOverdue) return 0;
  const now = new Date();
  const dueDate = new Date(this.payment.dueDate);
  const diffTime = now - dueDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to calculate balance and update payment status
receiptSchema.pre('save', function (next) {
  // Calculate balance with proper rounding to avoid floating point issues
  const totalAmount = Math.round(this.payment.totalAmount * 100) / 100;
  const amountPaid = Math.round(this.payment.amountPaid * 100) / 100;

  this.payment.balance = Math.max(
    0,
    Math.round((totalAmount - amountPaid) * 100) / 100
  );

  // Update payment status based on amounts
  if (amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (amountPaid < totalAmount) {
    this.payment.status = 'partial';
  } else if (amountPaid >= totalAmount) {
    this.payment.status = 'paid';
  }

  // Check if overdue
  if (
    this.payment.dueDate &&
    this.payment.dueDate < new Date() &&
    this.payment.status !== 'paid'
  ) {
    this.payment.status = 'overdue';
  }

  next();
});

// Pre-save middleware to validate receipt type requirements
receiptSchema.pre('save', function (next) {
  // Commitment, final, and one_time receipts require locations
  if (['commitment', 'final', 'one_time'].includes(this.receiptType)) {
    if (!this.locations.from || !this.locations.to) {
      return next(
        new Error(
          'Pickup and destination locations are required for this receipt type'
        )
      );
    }
  }

  // Removed commitment receipt reference requirement - receipts are now independent

  next();
});

// Pre-save middleware to handle versioning
receiptSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    // Create version entry for modifications
    const changes = {};
    const modifiedPaths = this.modifiedPaths();

    modifiedPaths.forEach(path => {
      if (path !== 'version' && path !== 'versions' && path !== 'updatedAt') {
        changes[path] = {
          old: this.get(path),
          new: this.get(path)
        };
      }
    });

    if (Object.keys(changes).length > 0) {
      this.version += 1;
      this.versions.push({
        versionNumber: this.version,
        editedBy: this.get('_editedBy') || this.createdBy, // Set by controller
        changes
      });
    }
  }

  next();
});

// Static method to generate receipt number
receiptSchema.statics.generateReceiptNumber = async function (receiptType) {
  // Determine prefix based on receipt type
  const prefixMap = {
    box: 'BOX',
    commitment: 'COM',
    final: 'FIN',
    one_time: 'OTP'
  };

  const prefix = prefixMap[receiptType] || 'RCP';
  const counterKey = `${receiptType}_receipt`;

  // Find or create counter for the receipt type (no year)
  const Counter = mongoose.model('Counter');
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  );

  const sequenceNumber = String(counter.sequence).padStart(5, '0');
  return `AMRC-${prefix}-${sequenceNumber}`;
};

// Static method to find by receipt number
receiptSchema.statics.findByReceiptNumber = function (receiptNumber) {
  return this.findOne({ receiptNumber });
};

// Static method to find by payment status
receiptSchema.statics.findByPaymentStatus = function (status) {
  return this.find({ 'payment.status': status });
};

// Static method to find overdue receipts
receiptSchema.statics.findOverdue = function () {
  return this.find({
    'payment.dueDate': { $lt: new Date() },
    'payment.status': { $in: ['pending', 'partial'] }
  });
};

// Instance method to add payment
receiptSchema.methods.addPayment = function (paymentData) {
  // Add to payment history
  this.payment.paymentHistory.push(paymentData);

  // Update total amount paid with proper rounding
  const totalPaid = this.payment.paymentHistory.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );

  // Round to 2 decimal places to avoid floating point issues
  this.payment.amountPaid = Math.round(totalPaid * 100) / 100;

  // Set payment method to the latest one
  this.payment.method = paymentData.method;

  return this.save();
};

// Instance method to refund payment
receiptSchema.methods.refundPayment = function (amount, refundedBy, reason) {
  if (amount > this.payment.amountPaid) {
    throw new Error('Refund amount cannot exceed amount paid');
  }

  // Add refund to payment history (negative amount)
  this.payment.paymentHistory.push({
    amount: -amount,
    method: 'refund',
    reference: `Refund: ${reason}`,
    receivedBy: refundedBy,
    notes: reason
  });

  // Update amounts
  this.payment.amountPaid -= amount;
  this.payment.status =
    amount === this.payment.amountPaid ? 'refunded' : 'partial';

  return this.save();
};

// Instance method to link to quotation
receiptSchema.methods.linkToQuotation = function (quotationId) {
  this.quotationId = quotationId;
  return this.save();
};

module.exports = mongoose.model('Receipt', receiptSchema);
