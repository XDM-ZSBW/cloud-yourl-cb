const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  role: {
    type: String,
    enum: ['admin', 'family', 'friend', 'user'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  profile: {
    avatar: String,
    bio: String,
    location: String,
    timezone: String,
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto'
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        clipboard: { type: Boolean, default: true }
      }
    }
  },
  // Family and friend relationships
  familyGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FamilyGroup'
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pendingFriendRequests: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Product access control
  productAccess: [{
    productId: {
      type: String,
      required: true
    },
    productName: String,
    accessLevel: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read'
    },
    grantedAt: {
      type: Date,
      default: Date.now
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    expiresAt: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Security settings
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  backupCodes: [String],
  // Activity tracking
  activityLog: [{
    action: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for display name
userSchema.virtual('displayName').get(function() {
  return this.username || this.fullName;
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'productAccess.productId': 1 });
userSchema.index({ familyGroup: 1 });
userSchema.index({ friends: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Method to check product access
userSchema.methods.hasProductAccess = function(productId, accessLevel = 'read') {
  const product = this.productAccess.find(p => 
    p.productId === productId && p.isActive
  );
  
  if (!product) return false;
  
  const levels = { read: 1, write: 2, admin: 3 };
  return levels[product.accessLevel] >= levels[accessLevel];
};

// Method to add product access
userSchema.methods.addProductAccess = function(productId, productName, accessLevel = 'read', grantedBy = null, expiresAt = null) {
  const existingIndex = this.productAccess.findIndex(p => p.productId === productId);
  
  if (existingIndex >= 0) {
    this.productAccess[existingIndex] = {
      productId,
      productName,
      accessLevel,
      grantedAt: new Date(),
      grantedBy,
      expiresAt,
      isActive: true
    };
  } else {
    this.productAccess.push({
      productId,
      productName,
      accessLevel,
      grantedAt: new Date(),
      grantedBy,
      expiresAt,
      isActive: true
    });
  }
  
  return this.save();
};

// Method to remove product access
userSchema.methods.removeProductAccess = function(productId) {
  const existingIndex = this.productAccess.findIndex(p => p.productId === productId);
  
  if (existingIndex >= 0) {
    this.productAccess[existingIndex].isActive = false;
    return this.save();
  }
  
  return Promise.resolve();
};

// Static method to find users by product access
userSchema.statics.findByProductAccess = function(productId) {
  return this.find({
    'productAccess.productId': productId,
    'productAccess.isActive': true
  });
};

module.exports = mongoose.model('User', userSchema);
