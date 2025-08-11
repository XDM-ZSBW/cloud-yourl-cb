const mongoose = require('mongoose');

const clipboardSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'link'],
    default: 'text'
  },
  productId: {
    type: String,
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedAt: Date,
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  metadata: {
    // For text entries
    language: String,
    wordCount: Number,
    characterCount: Number,
    
    // For image entries
    dimensions: {
      width: Number,
      height: Number
    },
    format: String,
    size: Number, // in bytes
    
    // For file entries
    fileName: String,
    fileSize: Number,
    mimeType: String,
    checksum: String,
    
    // For link entries
    url: String,
    title: String,
    description: String,
    thumbnail: String,
    
    // General metadata
    source: String, // e.g., 'browser', 'desktop', 'mobile'
    device: String,
    application: String
  },
  // Access control
  accessLevel: {
    type: String,
    enum: ['public', 'private', 'shared'],
    default: 'private'
  },
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    accessLevel: {
      type: String,
      enum: ['read', 'write'],
      default: 'read'
    },
    grantedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Analytics and tracking
  viewCount: {
    type: Number,
    default: 0
  },
  copyCount: {
    type: Number,
    default: 0
  },
  // Expiration and cleanup
  expiresAt: Date,
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for favorite count
clipboardSchema.virtual('favoriteCount').get(function() {
  return this.favoritedBy.length;
});

// Virtual for is favorited by current user (to be populated)
clipboardSchema.virtual('isFavorited').get(function() {
  return false; // Will be set by application logic
});

// Indexes for performance
clipboardSchema.index({ productId: 1, createdAt: -1 });
clipboardSchema.index({ productId: 1, type: 1 });
clipboardSchema.index({ productId: 1, tags: 1 });
clipboardSchema.index({ productId: 1, createdBy: 1 });
clipboardSchema.index({ productId: 1, isPublic: 1 });
clipboardSchema.index({ 'sharedWith.userId': 1 });
clipboardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text search index
clipboardSchema.index({ content: 'text', tags: 'text' });

// Pre-save middleware
clipboardSchema.pre('save', function(next) {
  // Update metadata based on content type
  if (this.isModified('content') || this.isModified('type')) {
    this.updateMetadata();
  }
  
  // Set last modified info
  if (this.isModified('content') || this.isModified('tags') || this.isModified('isPublic')) {
    this.lastModifiedAt = new Date();
  }
  
  next();
});

// Method to update metadata
clipboardSchema.methods.updateMetadata = function() {
  if (this.type === 'text') {
    this.metadata.wordCount = this.content.split(/\s+/).filter(word => word.length > 0).length;
    this.metadata.characterCount = this.content.length;
  } else if (this.type === 'link') {
    try {
      const url = new URL(this.content);
      this.metadata.url = this.content;
      this.metadata.domain = url.hostname;
    } catch (error) {
      // Invalid URL, keep as is
    }
  }
};

// Method to increment view count
clipboardSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Method to increment copy count
clipboardSchema.methods.incrementCopyCount = function() {
  this.copyCount += 1;
  return this.save();
};

// Method to add tag
clipboardSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag.toLowerCase())) {
    this.tags.push(tag.toLowerCase());
    return this.save();
  }
  return Promise.resolve();
};

// Method to remove tag
clipboardSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag.toLowerCase());
  return this.save();
};

// Method to check if user has access
clipboardSchema.methods.userHasAccess = function(userId, requiredLevel = 'read') {
  // Public entries are accessible to everyone
  if (this.isPublic) return true;
  
  // Creator has full access
  if (this.createdBy.toString() === userId.toString()) return true;
  
  // Check shared access
  const sharedAccess = this.sharedWith.find(share => 
    share.userId.toString() === userId.toString()
  );
  
  if (sharedAccess) {
    const levels = { read: 1, write: 2 };
    const required = levels[requiredLevel];
    const granted = levels[sharedAccess.accessLevel];
    return granted >= required;
  }
  
  return false;
};

// Method to share with user
clipboardSchema.methods.shareWithUser = function(userId, accessLevel = 'read') {
  const existingIndex = this.sharedWith.findIndex(share => 
    share.userId.toString() === userId.toString()
  );
  
  if (existingIndex >= 0) {
    this.sharedWith[existingIndex].accessLevel = accessLevel;
    this.sharedWith[existingIndex].grantedAt = new Date();
  } else {
    this.sharedWith.push({
      userId,
      accessLevel,
      grantedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to remove user access
clipboardSchema.methods.removeUserAccess = function(userId) {
  this.sharedWith = this.sharedWith.filter(share => 
    share.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Static method to find entries by product
clipboardSchema.statics.findByProduct = function(productId, options = {}) {
  const query = { productId };
  
  if (options.type) query.type = options.type;
  if (options.tags && options.tags.length > 0) {
    query.tags = { $in: options.tags.map(tag => tag.toLowerCase()) };
  }
  if (options.search) {
    query.$text = { $search: options.search };
  }
  if (options.userId) {
    query.$or = [
      { createdBy: options.userId },
      { isPublic: true },
      { 'sharedWith.userId': options.userId }
    ];
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get popular tags
clipboardSchema.statics.getPopularTags = function(productId, limit = 20) {
  return this.aggregate([
    { $match: { productId } },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

// Static method to cleanup expired entries
clipboardSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    { expiresAt: { $lt: new Date() } },
    { $set: { isArchived: true } }
  );
};

module.exports = mongoose.model('Clipboard', clipboardSchema);
