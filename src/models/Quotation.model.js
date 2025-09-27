/**
 * Quotation Model
 * Handles quotation data and PDF generation tracking
 */

const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^AMRC-\d{5}$/,
        'Quotation number must follow format AMRC-NNNNN'
      ]
    },
    type: {
      type: String,
      required: [true, 'Quotation type is required'],
      enum: {
        values: ['Residential', 'International', 'Office'],
        message:
          'Type must be Residential Move, International Move, or Office Move'
      }
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
      company: {
        type: String,
        trim: true,
        maxlength: [200, 'Company name cannot exceed 200 characters']
        // Required for office moves - validated in pre-save middleware
      },
      gender: {
        type: String,
        enum: {
          values: ['male', 'female', ''],
          message: 'Gender must be male, female, or empty'
        },
        default: ''
      }
    },
    locations: {
      from: {
        type: String,
        required: [true, 'Pickup location is required'],
        trim: true,
        maxlength: [300, 'Pickup location cannot exceed 300 characters']
      },
      to: {
        type: String,
        required: [true, 'Destination location is required'],
        trim: true,
        maxlength: [300, 'Destination location cannot exceed 300 characters']
      },
      movingDate: {
        type: Date,
        required: [true, 'Moving date is required'],
        validate: {
          validator: function (v) {
            return v > new Date();
          },
          message: 'Moving date must be in the future'
        }
      }
    },
    services: [
      {
        name: {
          type: String,
          required: [true, 'Service name is required'],
          trim: true,
          maxlength: [100, 'Service name cannot exceed 100 characters']
        },
        description: {
          type: String,
          required: [true, 'Service description is required'],
          trim: true,
          maxlength: [500, 'Service description cannot exceed 500 characters']
        },
        quantity: {
          type: Number,
          required: [true, 'Service quantity is required'],
          min: [1, 'Quantity must be at least 1']
        },
        unitPrice: {
          type: Number,
          required: [true, 'Unit price is required'],
          min: [0, 'Unit price cannot be negative']
        },
        total: {
          type: Number,
          required: [true, 'Service total is required'],
          min: [0, 'Total cannot be negative']
        }
      }
    ],
    pricing: {
      currency: {
        type: String,
        required: [true, 'Currency is required'],
        enum: {
          values: ['UGX', 'USD'],
          message: 'Currency must be UGX or USD'
        },
        default: 'UGX'
      },
      subtotal: {
        type: Number,
        required: [true, 'Subtotal is required'],
        min: [0, 'Subtotal cannot be negative']
      },
      discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
      },
      taxRate: {
        type: Number,
        default: 0.18, // 18% VAT
        min: [0, 'Tax rate cannot be negative'],
        max: [1, 'Tax rate cannot exceed 100%']
      },
      taxAmount: {
        type: Number,
        required: [true, 'Tax amount is required'],
        min: [0, 'Tax amount cannot be negative']
      },
      totalAmount: {
        type: Number,
        required: [true, 'Total amount is required'],
        min: [0, 'Total amount cannot be negative']
      }
    },
    validity: {
      validUntil: {
        type: Date
      },
      daysValid: {
        type: Number,
        default: 30,
        min: [7, 'Validity must be at least 7 days'],
        max: [90, 'Validity cannot exceed 90 days']
      },
      status: {
        type: String,
        enum: {
          values: ['active', 'expired', 'converted'],
          message: 'Status must be active, expired, or converted'
        },
        default: 'active'
      }
    },
    termsAndConditions: {
      type: String,
      trim: true,
      maxlength: [2000, 'Terms and conditions cannot exceed 2000 characters']
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator is required']
    },
    pdfUrl: {
      type: String,
      trim: true
    },
    version: {
      type: Number,
      default: 1,
      min: [1, 'Version must be at least 1']
    },
    convertedToReceipt: {
      receiptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Receipt'
      },
      convertedAt: {
        type: Date
      },
      convertedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
quotationSchema.index({ quotationNumber: 1 });
quotationSchema.index({ type: 1 });
quotationSchema.index({ createdBy: 1 });
quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ 'validity.status': 1 });
quotationSchema.index({ 'validity.validUntil': 1 });
quotationSchema.index({ 'client.name': 'text', 'client.company': 'text' }); // Text search

// Compound indexes
quotationSchema.index({ createdBy: 1, createdAt: -1 });
quotationSchema.index({ type: 1, createdAt: -1 });

// Virtual for checking if quotation is expired
quotationSchema.virtual('isExpired').get(function () {
  return this.validity.validUntil < new Date();
});

// Virtual for remaining validity days
quotationSchema.virtual('remainingDays').get(function () {
  const now = new Date();
  const validUntil = new Date(this.validity.validUntil);
  const diffTime = validUntil - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Pre-save middleware to calculate pricing
quotationSchema.pre('save', function (next) {
  // Calculate subtotal from services
  this.pricing.subtotal = this.services.reduce(
    (sum, service) => sum + service.total,
    0
  );

  // Calculate tax amount
  const taxableAmount = this.pricing.subtotal - (this.pricing.discount || 0);
  this.pricing.taxAmount = taxableAmount * this.pricing.taxRate;

  // Calculate total amount
  this.pricing.totalAmount = taxableAmount + this.pricing.taxAmount;

  next();
});

// Pre-save middleware to validate office move requirements
quotationSchema.pre('save', function (next) {
  if (this.type === 'Office Move' && !this.client.company) {
    return next(new Error('Company name is required for office moves'));
  }
  next();
});

// Pre-save middleware to set validity date
quotationSchema.pre('save', function (next) {
  if (!this.validity.validUntil) {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + this.validity.daysValid);
    this.validity.validUntil = validUntil;
  }
  next();
});

// Pre-save middleware to update validity status
quotationSchema.pre('save', function (next) {
  if (
    this.validity.validUntil < new Date() &&
    this.validity.status === 'active'
  ) {
    this.validity.status = 'expired';
  }
  next();
});

// Static method to generate quotation number
quotationSchema.statics.generateQuotationNumber = async function () {
  const counterKey = `quotation`;

  // Find or create counter for quotations (no year)
  const Counter = mongoose.model('Counter');
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  );

  const sequenceNumber = String(counter.sequence).padStart(5, '0');
  return `AMRC-${sequenceNumber}`;
};

// Static method to find by quotation number
quotationSchema.statics.findByQuotationNumber = function (quotationNumber) {
  return this.findOne({ quotationNumber });
};

// Static method to find active quotations
quotationSchema.statics.findActive = function () {
  return this.find({ 'validity.status': 'active' });
};

// Static method to find expired quotations
quotationSchema.statics.findExpired = function () {
  return this.find({
    $or: [
      { 'validity.status': 'expired' },
      { 'validity.validUntil': { $lt: new Date() } }
    ]
  });
};

// Instance method to extend validity
quotationSchema.methods.extendValidity = function (days, reason, extendedBy) {
  const newValidUntil = new Date(this.validity.validUntil);
  newValidUntil.setDate(newValidUntil.getDate() + days);

  this.validity.validUntil = newValidUntil;
  this.validity.status = 'active';

  // Log extension (could be stored in audit logs)
  this.notes =
    `${this.notes || ''}\nValidity extended by ${days} days on ${new Date().toISOString()} by ${extendedBy}. Reason: ${reason}`.trim();

  return this.save();
};

// Instance method to convert to receipt
quotationSchema.methods.convertToReceipt = function (receiptId, convertedBy) {
  this.convertedToReceipt = {
    receiptId,
    convertedAt: new Date(),
    convertedBy
  };
  this.validity.status = 'converted';

  return this.save();
};

module.exports = mongoose.model('Quotation', quotationSchema);
