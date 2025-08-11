const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  productName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['extension', 'web-app', 'mobile-app', 'desktop-app', 'api', 'service'],
    required: true
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0'
  },
  status: {
    type: String,
    enum: ['active', 'beta', 'deprecated', 'maintenance'],
    default: 'active'
  },
  // Access control
  accessLevel: {
    type: String,
    enum: ['public', 'registered', 'invite-only', 'family-only'],
    default: 'invite-only'
  },
  maxUsers: {
    type: Number,
    default: 1000
  },
  currentUsers: {
    type: Number,
    default: 0
  },
  // Features and capabilities
  features: [{
    name: String,
    description: String,
    isEnabled: {
      type: Boolean,
      default: true
    },
    requiresPermission: {
      type: Boolean,
      default: false
    }
  }],
  permissions: [{
    name: String,
    description: String,
    scope: {
      type: String,
      enum: ['user', 'family', 'global'],
      default: 'user'
    }
  }],
  // Integration settings
  integrations: {
    zaidoExtension: {
      isEnabled: {
        type: Boolean,
        default: true
      },
      apiVersion: String,
      supportedBrowsers: [String],
      permissions: [String]
    },
    webApp: {
      isEnabled: {
        type: Boolean,
        default: true
      },
      url: String,
      allowedDomains: [String]
    },
    mobileApp: {
      isEnabled: {
        type: Boolean,
        default: false
      },
      platform: {
        type: String,
        enum: ['ios', 'android', 'both'],
        default: 'both'
      }
    }
  },
  // Security settings
  security: {
    requires2FA: {
      type: Boolean,
      default: false
    },
    maxLoginAttempts: {
      type: Number,
      default: 5
    },
    sessionTimeout: {
      type: Number,
      default: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },
    allowedIPs: [String],
    blockedIPs: [String],
    geoRestrictions: [String]
  },
  // Rate limiting
  rateLimits: {
    requestsPerMinute: {
      type: Number,
      default: 60
    },
    requestsPerHour: {
      type: Number,
      default: 1000
    },
    requestsPerDay: {
      type: Number,
      default: 10000
    },
    maxFileSize: {
      type: Number,
      default: 10 * 1024 * 1024 // 10MB
    },
    maxClipboardEntries: {
      type: Number,
      default: 1000
    }
  },
  // Monitoring and analytics
  analytics: {
    isEnabled: {
      type: Boolean,
      default: true
    },
    trackUsage: {
      type: Boolean,
      default: true
    },
    trackErrors: {
      type: Boolean,
      default: true
    },
    trackPerformance: {
      type: Boolean,
      default: true
    }
  },
  // Maintenance and updates
  maintenance: {
    isUnderMaintenance: {
      type: Boolean,
      default: false
    },
    maintenanceMessage: String,
    scheduledMaintenance: [{
      startTime: Date,
      endTime: Date,
      message: String
    }],
    lastUpdate: Date,
    updateNotes: String
  },
  // Owner and administrators
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  administrators: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'support'],
      default: 'moderator'
    },
    grantedAt: {
      type: Date,
      default: Date.now
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Product-specific settings
  settings: {
    clipboard: {
      maxContentLength: {
        type: Number,
        default: 10 * 1024 * 1024 // 10MB
      },
      allowedContentTypes: [String],
      autoBackup: {
        type: Boolean,
        default: true
      },
      backupRetention: {
        type: Number,
        default: 30 // days
      },
      encryption: {
        type: Boolean,
        default: false
      }
    },
    sharing: {
      allowPublicSharing: {
        type: Boolean,
        default: false
      },
      allowFamilySharing: {
        type: Boolean,
        default: true
      },
      allowFriendSharing: {
        type: Boolean,
        default: true
      },
      maxSharedUsers: {
        type: Number,
        default: 50
      }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for isAvailable
productSchema.virtual('isAvailable').get(function() {
  return this.status === 'active' && 
         !this.maintenance.isUnderMaintenance &&
         this.currentUsers < this.maxUsers;
});

// Virtual for canAcceptUsers
productSchema.virtual('canAcceptUsers').get(function() {
  return this.isAvailable && this.accessLevel !== 'deprecated';
});

// Indexes
productSchema.index({ productId: 1 });
productSchema.index({ status: 1 });
productSchema.index({ accessLevel: 1 });
productSchema.index({ owner: 1 });
productSchema.index({ 'administrators.userId': 1 });
productSchema.index({ category: 1 });

// Pre-save middleware
productSchema.pre('save', function(next) {
  // Update lastUpdate timestamp
  if (this.isModified()) {
    this.maintenance.lastUpdate = new Date();
  }
  
  next();
});

// Method to check if user can access
productSchema.methods.canUserAccess = function(userId, userRole = 'user') {
  // Check if product is available
  if (!this.isAvailable) {
    return { canAccess: false, reason: 'Product not available' };
  }
  
  // Check if user is owner or administrator
  if (this.owner.toString() === userId.toString()) {
    return { canAccess: true, level: 'owner' };
  }
  
  const admin = this.administrators.find(a => a.userId.toString() === userId.toString());
  if (admin) {
    return { canAccess: true, level: admin.role };
  }
  
  // Check access level restrictions
  switch (this.accessLevel) {
    case 'public':
      return { canAccess: true, level: 'public' };
    case 'registered':
      return { canAccess: true, level: 'registered' };
    case 'invite-only':
      return { canAccess: false, reason: 'Invite required' };
    case 'family-only':
      return { canAccess: false, reason: 'Family access required' };
    default:
      return { canAccess: false, reason: 'Access restricted' };
  }
};

// Method to add administrator
productSchema.methods.addAdministrator = function(userId, role = 'moderator', grantedBy) {
  const existingIndex = this.administrators.findIndex(a => 
    a.userId.toString() === userId.toString()
  );
  
  if (existingIndex >= 0) {
    this.administrators[existingIndex] = {
      userId,
      role,
      grantedAt: new Date(),
      grantedBy: grantedBy || this.owner
    };
  } else {
    this.administrators.push({
      userId,
      role,
      grantedAt: new Date(),
      grantedBy: grantedBy || this.owner
    });
  }
  
  return this.save();
};

// Method to remove administrator
productSchema.methods.removeAdministrator = function(userId) {
  this.administrators = this.administrators.filter(a => 
    a.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

// Method to increment user count
productSchema.methods.incrementUserCount = function() {
  if (this.currentUsers < this.maxUsers) {
    this.currentUsers += 1;
    return this.save();
  }
  return Promise.reject(new Error('Maximum users reached'));
};

// Method to decrement user count
productSchema.methods.decrementUserCount = function() {
  if (this.currentUsers > 0) {
    this.currentUsers -= 1;
    return this.save();
  }
  return Promise.resolve();
};

// Method to check rate limits
productSchema.methods.checkRateLimit = function(userId, action = 'request') {
  // This would typically integrate with Redis for actual rate limiting
  // For now, return true (allowed)
  return { allowed: true, remaining: 1000 };
};

// Static method to find active products
productSchema.statics.findActive = function() {
  return this.find({
    status: 'active',
    'maintenance.isUnderMaintenance': false
  });
};

// Static method to find products by category
productSchema.statics.findByCategory = function(category) {
  return this.find({
    category,
    status: 'active',
    'maintenance.isUnderMaintenance': false
  });
};

module.exports = mongoose.model('Product', productSchema);
