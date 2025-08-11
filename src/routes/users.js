const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const FamilyGroup = require('../models/FamilyGroup');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateProfileUpdate = [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('location').optional().trim().isLength({ max: 100 }),
  body('timezone').optional().trim(),
  body('profile.theme').optional().isIn(['light', 'dark', 'auto']),
  body('profile.notifications.email').optional().isBoolean(),
  body('profile.notifications.push').optional().isBoolean(),
  body('profile.notifications.clipboard').optional().isBoolean()
];

const validateFriendRequest = [
  body('userId').isMongoId()
];

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -twoFactorSecret -backupCodes')
      .populate('familyGroup', 'name description')
      .populate('friends', 'username firstName lastName profile.avatar')
      .populate('pendingFriendRequests.from', 'username firstName lastName profile.avatar');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private
router.put('/profile', validateProfileUpdate, authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'bio', 'location', 'timezone', 'profile'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    }

    await user.save();

    // Log activity
    user.activityLog.push({
      action: 'profile_updated',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        profile: user.profile,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// @route   GET /api/users/search
// @desc    Search users by username or email
// @access  Private
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await User.find({
      $and: [
        {
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { firstName: { $regex: q, $options: 'i' } },
            { lastName: { $regex: q, $options: 'i' } }
          ]
        },
        { _id: { $ne: req.user._id } }, // Exclude current user
        { isActive: true }
      ]
    })
    .select('username firstName lastName profile.avatar')
    .limit(parseInt(limit));

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// @route   POST /api/users/friend-request
// @desc    Send friend request
// @access  Private
router.post('/friend-request', validateFriendRequest, authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (userId === currentUserId.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!targetUser.isActive) {
      return res.status(400).json({ error: 'User account is not active' });
    }

    // Check if already friends
    if (req.user.friends.includes(userId)) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    // Check if request already sent
    if (req.user.pendingFriendRequests.some(req => req.from.toString() === userId)) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if request already received
    if (targetUser.pendingFriendRequests.some(req => req.from.toString() === currentUserId.toString())) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Add to target user's pending requests
    targetUser.pendingFriendRequests.push({
      from: currentUserId,
      sentAt: new Date()
    });

    await targetUser.save();

    // Log activity
    req.user.activityLog.push({
      action: 'friend_request_sent',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { targetUserId: userId }
    });
    await req.user.save();

    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// @route   POST /api/users/friend-request/:requestId/accept
// @desc    Accept friend request
// @access  Private
router.post('/friend-request/:requestId/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    const request = user.pendingFriendRequests.id(requestId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const senderId = request.from;

    // Remove from pending requests
    user.pendingFriendRequests.pull(requestId);

    // Add to friends list
    user.friends.push(senderId);

    // Add current user to sender's friends list
    const sender = await User.findById(senderId);
    sender.friends.push(currentUserId);

    // Remove any pending request from current user to sender
    sender.pendingFriendRequests = sender.pendingFriendRequests.filter(
      req => req.from.toString() !== currentUserId.toString()
    );

    await Promise.all([user.save(), sender.save()]);

    // Log activity
    user.activityLog.push({
      action: 'friend_request_accepted',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { senderId }
    });
    await user.save();

    res.json({ message: 'Friend request accepted successfully' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// @route   POST /api/users/friend-request/:requestId/decline
// @desc    Decline friend request
// @access  Private
router.post('/friend-request/:requestId/decline', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    const request = user.pendingFriendRequests.id(requestId);

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Remove from pending requests
    user.pendingFriendRequests.pull(requestId);
    await user.save();

    // Log activity
    user.activityLog.push({
      action: 'friend_request_declined',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { senderId: request.from }
    });
    await user.save();

    res.json({ message: 'Friend request declined successfully' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// @route   DELETE /api/users/friends/:friendId
// @desc    Remove friend
// @access  Private
router.delete('/friends/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    // Remove from friends list
    user.friends = user.friends.filter(id => id.toString() !== friendId);
    friend.friends = friend.friends.filter(id => id.toString() !== currentUserId.toString());

    await Promise.all([user.save(), friend.save()]);

    // Log activity
    user.activityLog.push({
      action: 'friend_removed',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { friendId }
    });
    await user.save();

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// @route   GET /api/users/family-group
// @desc    Get user's family group
// @access  Private
router.get('/family-group', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'familyGroup',
        populate: {
          path: 'members',
          select: 'username firstName lastName profile.avatar role'
        }
      });

    if (!user.familyGroup) {
      return res.json({ familyGroup: null });
    }

    res.json({ familyGroup: user.familyGroup });
  } catch (error) {
    console.error('Get family group error:', error);
    res.status(500).json({ error: 'Failed to get family group' });
  }
});

// @route   POST /api/users/family-group
// @desc    Create or join family group
// @access  Private
router.post('/family-group', authenticateToken, async (req, res) => {
  try {
    const { action, groupId, groupName, inviteCode } = req.body;
    const currentUserId = req.user._id;

    if (action === 'create') {
      // Create new family group
      if (!groupName) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const existingGroup = await FamilyGroup.findOne({ name: groupName });
      if (existingGroup) {
        return res.status(400).json({ error: 'Group name already exists' });
      }

      const familyGroup = new FamilyGroup({
        name: groupName,
        owner: currentUserId,
        members: [currentUserId]
      });

      await familyGroup.save();

      // Update user's family group
      const user = await User.findById(currentUserId);
      user.familyGroup = familyGroup._id;
      user.role = 'family';
      await user.save();

      res.json({
        message: 'Family group created successfully',
        familyGroup
      });
    } else if (action === 'join') {
      // Join existing family group
      if (!inviteCode) {
        return res.status(400).json({ error: 'Invite code is required' });
      }

      const familyGroup = await FamilyGroup.findOne({ inviteCode });
      if (!familyGroup) {
        return res.status(404).json({ error: 'Invalid invite code' });
      }

      if (familyGroup.members.includes(currentUserId)) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }

      // Add user to group
      familyGroup.members.push(currentUserId);
      await familyGroup.save();

      // Update user's family group
      const user = await User.findById(currentUserId);
      user.familyGroup = familyGroup._id;
      user.role = 'family';
      await user.save();

      res.json({
        message: 'Joined family group successfully',
        familyGroup
      });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Family group action error:', error);
    res.status(500).json({ error: 'Failed to process family group action' });
  }
});

// @route   GET /api/users/activity
// @desc    Get user's activity log
// @access  Private
router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activities = user.activityLog
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(skip, skip + parseInt(limit));

    const total = user.activityLog.length;

    res.json({
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({ error: 'Failed to get activity log' });
  }
});

// @route   GET /api/users/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build query
    let query = {};
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = user.notifications
      .filter(notification => {
        if (unreadOnly === 'true') {
          return !notification.isRead;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + parseInt(limit));

    const total = user.notifications.length;

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// @route   PUT /api/users/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await user.save();

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// @route   PUT /api/users/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mark all unread notifications as read
    user.notifications.forEach(notification => {
      if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
      }
    });

    await user.save();

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// @route   PUT /api/users/notifications/preferences
// @desc    Update notification preferences
// @access  Private
router.put('/notifications/preferences', authenticateToken, async (req, res) => {
  try {
    const { email, push, clipboard, frequency } = req.body;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update notification preferences
    if (email !== undefined) user.profile.notifications.email = email;
    if (push !== undefined) user.profile.notifications.push = push;
    if (clipboard !== undefined) user.profile.notifications.clipboard = clipboard;
    if (frequency !== undefined) user.profile.notifications.frequency = frequency;

    await user.save();

    // Log activity
    user.activityLog.push({
      action: 'notification_preferences_updated',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    await user.save();

    res.json({
      message: 'Notification preferences updated successfully',
      preferences: user.profile.notifications
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
