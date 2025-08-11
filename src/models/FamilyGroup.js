const mongoose = require('mongoose');

const familyGroupSchema = new mongoose.Schema({
  name: {
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
  // Family group settings
  settings: {
    privacy: {
      type: String,
      enum: ['private', 'family-only', 'friends-of-family'],
      default: 'family-only'
    },
    allowInvites: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: true
    },
    maxMembers: {
      type: Number,
      default: 20
    }
  },
  // Members
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'guest'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      canInvite: {
        type: Boolean,
        default: false
      },
      canManageMembers: {
        type: Boolean,
        default: false
      },
      canViewAll: {
        type: Boolean,
        default: true
      },
      canShare: {
        type: Boolean,
        default: true
      }
    }
  }],
  // Pending invitations
  pendingInvitations: [{
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      }
    },
    role: {
      type: String,
      enum: ['member', 'guest'],
      default: 'member'
    },
    message: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending'
    }
  }],
  // Shared resources
  sharedProducts: [{
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
    sharedAt: {
      type: Date,
      default: Date.now
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Family preferences
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      clipboard: {
        type: Boolean,
        default: true
      }
    },
    autoSharing: {
      enabled: {
        type: Boolean,
        default: false
      },
      level: {
        type: String,
        enum: ['family', 'friends', 'public'],
        default: 'family'
      }
    }
  },
  // Activity and statistics
  activity: {
    lastActivity: Date,
    memberCount: {
      type: Number,
      default: 1
    },
    totalClipboards: {
      type: Number,
      default: 0
    },
    sharedClipboards: {
      type: Number,
      default: 0
    }
  },
  // Security settings
  security: {
    requireVerification: {
      type: Boolean,
      default: true
    },
    allowExternalSharing: {
      type: Boolean,
      default: false
    },
    maxFailedLogins: {
      type: Number,
      default: 5
    },
    sessionTimeout: {
      type: Number,
      default: 24 * 60 * 60 * 1000 // 24 hours
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for isFull
familyGroupSchema.virtual('isFull').get(function() {
  return this.members.length >= this.settings.maxMembers;
});

// Virtual for canAcceptMembers
familyGroupSchema.virtual('canAcceptMembers').get(function() {
  return !this.isFull && this.settings.allowInvites;
});

// Virtual for activeMembers
familyGroupSchema.virtual('activeMembers').get(function() {
  return this.members.filter(member => member.role !== 'guest');
});

// Indexes
familyGroupSchema.index({ owner: 1 });
familyGroupSchema.index({ 'members.userId': 1 });
familyGroupSchema.index({ 'pendingInvitations.email': 1 });
familyGroupSchema.index({ 'sharedProducts.productId': 1 });

// Pre-save middleware
familyGroupSchema.pre('save', function(next) {
  // Update member count
  this.activity.memberCount = this.members.length;
  
  // Update last activity
  this.activity.lastActivity = new Date();
  
  next();
});

// Method to add member
familyGroupSchema.methods.addMember = function(userId, role = 'member', invitedBy = null) {
  // Check if group is full
  if (this.isFull) {
    return Promise.reject(new Error('Family group is full'));
  }
  
  // Check if user is already a member
  const existingMember = this.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (existingMember) {
    return Promise.reject(new Error('User is already a member'));
  }
  
  // Add new member
  const newMember = {
    userId,
    role,
    joinedAt: new Date(),
    invitedBy,
    permissions: this.getDefaultPermissions(role)
  };
  
  this.members.push(newMember);
  
  return this.save();
};

// Method to remove member
familyGroupSchema.methods.removeMember = function(userId, removedBy) {
  const memberIndex = this.members.findIndex(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (memberIndex === -1) {
    return Promise.reject(new Error('User is not a member'));
  }
  
  const member = this.members[memberIndex];
  
  // Check if user can remove this member
  if (!this.canManageMember(removedBy, member)) {
    return Promise.reject(new Error('Insufficient permissions to remove member'));
  }
  
  // Remove member
  this.members.splice(memberIndex, 1);
  
  return this.save();
};

// Method to update member role
familyGroupSchema.methods.updateMemberRole = function(userId, newRole, updatedBy) {
  const member = this.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (!member) {
    return Promise.reject(new Error('User is not a member'));
  }
  
  // Check if user can update this member
  if (!this.canManageMember(updatedBy, member)) {
    return Promise.reject(new Error('Insufficient permissions to update member'));
  }
  
  // Update role and permissions
  member.role = newRole;
  member.permissions = this.getDefaultPermissions(newRole);
  
  return this.save();
};

// Method to invite user
familyGroupSchema.methods.inviteUser = function(email, role = 'member', invitedBy, message = '') {
  // Check if group can accept members
  if (!this.canAcceptMembers) {
    return Promise.reject(new Error('Group cannot accept new members'));
  }
  
  // Check if invitation already exists
  const existingInvitation = this.pendingInvitations.find(inv => 
    inv.email === email && inv.status === 'pending'
  );
  
  if (existingInvitation) {
    return Promise.reject(new Error('Invitation already sent to this email'));
  }
  
  // Create new invitation
  const invitation = {
    email,
    invitedBy,
    role,
    message,
    status: 'pending'
  };
  
  this.pendingInvitations.push(invitation);
  
  return this.save();
};

// Method to accept invitation
familyGroupSchema.methods.acceptInvitation = function(email, userId) {
  const invitation = this.pendingInvitations.find(inv => 
    inv.email === email && inv.status === 'pending'
  );
  
  if (!invitation) {
    return Promise.reject(new Error('Invitation not found or already processed'));
  }
  
  // Check if invitation is expired
  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    return this.save().then(() => {
      throw new Error('Invitation has expired');
    });
  }
  
  // Accept invitation
  invitation.status = 'accepted';
  
  // Add user as member
  return this.addMember(userId, invitation.role, invitation.invitedBy)
    .then(() => this.save());
};

// Method to decline invitation
familyGroupSchema.methods.declineInvitation = function(email) {
  const invitation = this.pendingInvitations.find(inv => 
    inv.email === email && inv.status === 'pending'
  );
  
  if (!invitation) {
    return Promise.reject(new Error('Invitation not found'));
  }
  
  invitation.status = 'declined';
  
  return this.save();
};

// Method to share product
familyGroupSchema.methods.shareProduct = function(productId, productName, accessLevel = 'read', sharedBy) {
  const existingShare = this.sharedProducts.find(share => 
    share.productId === productId
  );
  
  if (existingShare) {
    existingShare.accessLevel = accessLevel;
    existingShare.isActive = true;
  } else {
    this.sharedProducts.push({
      productId,
      productName,
      accessLevel,
      sharedAt: new Date(),
      sharedBy,
      isActive: true
    });
  }
  
  return this.save();
};

// Method to check if user can manage member
familyGroupSchema.methods.canManageMember = function(userId, targetMember) {
  const user = this.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (!user) return false;
  
  // Owner can manage everyone
  if (user.role === 'owner') return true;
  
  // Admin can manage members and guests, but not other admins or owner
  if (user.role === 'admin' && targetMember.role !== 'owner' && targetMember.role !== 'admin') {
    return true;
  }
  
  return false;
};

// Method to get default permissions for role
familyGroupSchema.methods.getDefaultPermissions = function(role) {
  switch (role) {
    case 'owner':
      return {
        canInvite: true,
        canManageMembers: true,
        canViewAll: true,
        canShare: true
      };
    case 'admin':
      return {
        canInvite: true,
        canManageMembers: true,
        canViewAll: true,
        canShare: true
      };
    case 'member':
      return {
        canInvite: false,
        canManageMembers: false,
        canViewAll: true,
        canShare: true
      };
    case 'guest':
      return {
        canInvite: false,
        canManageMembers: false,
        canViewAll: false,
        canShare: false
      };
    default:
      return {
        canInvite: false,
        canManageMembers: false,
        canViewAll: true,
        canShare: true
      };
  }
};

// Method to check if user has permission
familyGroupSchema.methods.hasPermission = function(userId, permission) {
  const member = this.members.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (!member) return false;
  
  return member.permissions[permission] || false;
};

// Static method to find groups by member
familyGroupSchema.statics.findByMember = function(userId) {
  return this.find({
    'members.userId': userId
  });
};

// Static method to find groups by owner
familyGroupSchema.statics.findByOwner = function(userId) {
  return this.find({
    owner: userId
  });
};

module.exports = mongoose.model('FamilyGroup', familyGroupSchema);
