/**
 * User Model
 * Handles user data and authentication
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'user'],
        message: 'Role must be either admin or user'
      },
      default: 'user'
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: 'Status must be active, inactive, or suspended'
      },
      default: 'active'
    },
    phonePrimary: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s\-()]{10,}$/, 'Please provide a valid phone number']
    },
    phoneSecondary: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s\-()]{10,}$/, 'Please provide a valid phone number']
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters']
    },
    emergencyContact: {
      type: String,
      trim: true,
      match: [/^[+]?[\d\s\-()]{10,}$/, 'Please provide a valid phone number']
    },
    profilePhoto: {
      publicId: {
        type: String,
        trim: true,
        default: 'default_wiyefz'
      },
      url: {
        type: String,
        trim: true,
        default: 'https://res.cloudinary.com/dvedpgxcz/image/upload/v1757960352/default_wiyefz.jpg'
      },
      originalName: {
        type: String,
        trim: true,
        default: 'default.jpg'
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    },
    profileCompleted: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    refreshToken: {
      type: String,
      select: false
    },
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    },
    signature: {
      type: {
        type: String,
        enum: {
          values: ['canvas', 'upload'],
          message: 'Signature type must be either canvas or upload'
        }
      },
      data: {
        type: String,
        trim: true
      },
      publicId: {
        type: String,
        trim: true
      },
      originalName: {
        type: String,
        trim: true
      },
      createdAt: {
        type: Date,
        default: Date.now
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
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for user statistics (will be populated by aggregation)
userSchema.virtual('statistics', {
  ref: 'Quotation',
  localField: '_id',
  foreignField: 'createdBy',
  count: true
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash password if it's modified or new
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to check profile completion
userSchema.pre('save', function (next) {
  // Required fields for complete profile
  const requiredFields = [
    this.fullName,
    this.email,
    this.phonePrimary,
    this.emergencyContact
  ];

  this.profileCompleted = requiredFields.every(
    field => field && field.trim().length > 0
  );
  next();
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Instance method to get safe user data (exclude sensitive fields)
userSchema.methods.getSafeData = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshToken;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  return userObject;
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ status: 'active' });
};

// Static method to find by email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);
