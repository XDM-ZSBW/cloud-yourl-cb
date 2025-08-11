const express = require('express');
const { body, validationResult } = require('express-validator');
const Clipboard = require('../models/Clipboard');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { validateProductAccess } = require('../middleware/productAccess');

const router = express.Router();

// Validation middleware
const validateShareEntry = [
  body('entryId').isMongoId(),
  body('userId').isMongoId(),
  body('accessLevel').isIn(['read', 'write']),
  body('message').optional().trim().isLength({ max: 500 })
];

const validateShareUpdate = [
  body('accessLevel').isIn(['read', 'write']),
  body('message').optional().trim().isLength({ max: 500 })
];

// @route   POST /api/shares
// @desc    Share a clipboard entry with another user
// @access  Private
router.post('/', validateShareEntry, validateProductAccess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entryId, userId, accessLevel, message, productId } = req.body;
    const currentUserId = req.user._id;

    // Check if trying to share with self
    if (userId === currentUserId.toString()) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }

    // Verify the clipboard entry exists and user has access
    const entry = await Clipboard.findOne({
      _id: entryId,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has permission to share this entry
    if (!entry.userHasAccess(currentUserId, 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions to share this entry' });
    }

    // Verify target user exists and is active
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (!targetUser.isActive) {
      return res.status(400).json({ error: 'Target user account is not active' });
    }

    // Check if already shared
    const existingShare = entry.sharedWith.find(share => 
      share.userId.toString() === userId
    );

    if (existingShare) {
      return res.status(400).json({ error: 'Entry is already shared with this user' });
    }

    // Share the entry
    await entry.shareWithUser(userId, accessLevel);

    // Log activity for both users
    entry.activityLog = entry.activityLog || [];
    entry.activityLog.push({
      action: 'shared',
      userId: currentUserId,
      timestamp: new Date(),
      details: {
        sharedWith: userId,
        accessLevel,
        message
      }
    });

    // Add to target user's product access if they don't have it
    if (!targetUser.hasProductAccess(productId, 'read')) {
      await targetUser.addProductAccess(productId, 'Shared Clipboard', 'read', currentUserId);
    }

    await entry.save();

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-shared', {
      action: 'shared',
      entryId,
      sharedWith: userId,
      accessLevel,
      productId
    });

    res.json({
      message: 'Entry shared successfully',
      share: {
        entryId,
        sharedWith: userId,
        accessLevel,
        message,
        sharedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Share entry error:', error);
    res.status(500).json({ error: 'Failed to share entry' });
  }
});

// @route   GET /api/shares/received
// @desc    Get entries shared with current user
// @access  Private
router.get('/received', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, productId } = req.query;
    const currentUserId = req.user._id;
    const skip = (page - 1) * limit;

    // Build query for entries shared with current user
    const query = {
      'sharedWith.userId': currentUserId,
      isArchived: false
    };

    if (productId) {
      query.productId = productId;
    }

    const sharedEntries = await Clipboard.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username firstName lastName profile.avatar')
      .populate('sharedWith.userId', 'username firstName lastName profile.avatar')
      .select('-content'); // Don't include full content in list view

    // Get total count
    const total = await Clipboard.countDocuments(query);

    res.json({
      sharedEntries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get shared entries error:', error);
    res.status(500).json({ error: 'Failed to get shared entries' });
  }
});

// @route   GET /api/shares/sent
// @desc    Get entries shared by current user
// @access  Private
router.get('/sent', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, productId } = req.query;
    const currentUserId = req.user._id;
    const skip = (page - 1) * limit;

    // Build query for entries shared by current user
    const query = {
      createdBy: currentUserId,
      'sharedWith.0': { $exists: true }, // Has at least one share
      isArchived: false
    };

    if (productId) {
      query.productId = productId;
    }

    const sharedEntries = await Clipboard.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sharedWith.userId', 'username firstName lastName profile.avatar')
      .select('-content'); // Don't include full content in list view

    // Get total count
    const total = await Clipboard.countDocuments(query);

    res.json({
      sharedEntries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get sent shares error:', error);
    res.status(500).json({ error: 'Failed to get sent shares' });
  }
});

// @route   PUT /api/shares/:entryId/:userId
// @desc    Update share permissions
// @access  Private
router.put('/:entryId/:userId', validateShareUpdate, validateProductAccess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entryId, userId } = req.params;
    const { accessLevel, message } = req.body;
    const { productId } = req.query;
    const currentUserId = req.user._id;

    // Verify the clipboard entry exists and user has access
    const entry = await Clipboard.findOne({
      _id: entryId,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has permission to modify this share
    if (!entry.userHasAccess(currentUserId, 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions to modify this share' });
    }

    // Find the share
    const shareIndex = entry.sharedWith.findIndex(share => 
      share.userId.toString() === userId
    );

    if (shareIndex === -1) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Update share permissions
    entry.sharedWith[shareIndex].accessLevel = accessLevel;
    entry.sharedWith[shareIndex].grantedAt = new Date();

    // Log activity
    entry.activityLog = entry.activityLog || [];
    entry.activityLog.push({
      action: 'share_updated',
      userId: currentUserId,
      timestamp: new Date(),
      details: {
        sharedWith: userId,
        newAccessLevel: accessLevel,
        message
      }
    });

    await entry.save();

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-share-updated', {
      action: 'updated',
      entryId,
      sharedWith: userId,
      accessLevel,
      productId
    });

    res.json({
      message: 'Share permissions updated successfully',
      share: entry.sharedWith[shareIndex]
    });
  } catch (error) {
    console.error('Update share error:', error);
    res.status(500).json({ error: 'Failed to update share' });
  }
});

// @route   DELETE /api/shares/:entryId/:userId
// @desc    Remove share with a user
// @access  Private
router.delete('/:entryId/:userId', validateProductAccess, async (req, res) => {
  try {
    const { entryId, userId } = req.params;
    const { productId } = req.query;
    const currentUserId = req.user._id;

    // Verify the clipboard entry exists and user has access
    const entry = await Clipboard.findOne({
      _id: entryId,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has permission to remove this share
    if (!entry.userHasAccess(currentUserId, 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions to remove this share' });
    }

    // Remove the share
    await entry.removeUserAccess(userId);

    // Log activity
    entry.activityLog = entry.activityLog || [];
    entry.activityLog.push({
      action: 'share_removed',
      userId: currentUserId,
      timestamp: new Date(),
      details: {
        removedFrom: userId
      }
    });

    await entry.save();

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-share-removed', {
      action: 'removed',
      entryId,
      removedFrom: userId,
      productId
    });

    res.json({ message: 'Share removed successfully' });
  } catch (error) {
    console.error('Remove share error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// @route   GET /api/shares/:entryId
// @desc    Get share details for a specific entry
// @access  Private
router.get('/:entryId', validateProductAccess, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { productId } = req.query;
    const currentUserId = req.user._id;

    // Verify the clipboard entry exists and user has access
    const entry = await Clipboard.findOne({
      _id: entryId,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has access to this entry
    if (!entry.userHasAccess(currentUserId, 'read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view this entry' });
    }

    // Get share details
    const shareDetails = {
      entryId,
      content: entry.content,
      type: entry.type,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt,
      sharedWith: entry.sharedWith,
      isPublic: entry.isPublic,
      accessLevel: entry.sharedWith.find(share => 
        share.userId.toString() === currentUserId.toString()
      )?.accessLevel || 'read'
    };

    res.json({ shareDetails });
  } catch (error) {
    console.error('Get share details error:', error);
    res.status(500).json({ error: 'Failed to get share details' });
  }
});

// @route   GET /api/shares/stats
// @desc    Get sharing statistics
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.query;
    const currentUserId = req.user._id;

    // Build query
    const query = productId ? { productId } : {};

    // Get total entries shared with current user
    const receivedShares = await Clipboard.countDocuments({
      ...query,
      'sharedWith.userId': currentUserId,
      isArchived: false
    });

    // Get total entries shared by current user
    const sentShares = await Clipboard.countDocuments({
      ...query,
      createdBy: currentUserId,
      'sharedWith.0': { $exists: true },
      isArchived: false
    });

    // Get recent shares
    const recentShares = await Clipboard.find({
      ...query,
      $or: [
        { 'sharedWith.userId': currentUserId },
        { createdBy: currentUserId, 'sharedWith.0': { $exists: true } }
      ],
      isArchived: false
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('createdBy', 'username firstName lastName')
    .populate('sharedWith.userId', 'username firstName lastName')
    .select('content type createdAt sharedWith createdBy');

    res.json({
      stats: {
        receivedShares,
        sentShares,
        totalShares: receivedShares + sentShares
      },
      recentShares
    });
  } catch (error) {
    console.error('Get share stats error:', error);
    res.status(500).json({ error: 'Failed to get share statistics' });
  }
});

// @route   GET /api/shares/analytics
// @desc    Get detailed sharing analytics
// @access  Private
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const { productId, period = '30d' } = req.query;
    const currentUserId = req.user._id;

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build base query
    const baseQuery = productId ? { productId } : {};

    // Get sharing analytics
    const sharingAnalytics = await Clipboard.aggregate([
      { 
        $match: { 
          ...baseQuery,
          'sharedWith.0': { $exists: true },
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type"
          },
          shares: { $sum: { $size: '$sharedWith' } },
          entries: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          types: {
            $push: {
              type: "$_id.type",
              shares: "$shares",
              entries: "$entries"
            }
          },
          totalShares: { $sum: "$shares" },
          totalEntries: { $sum: "$entries" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top shared content
    const topShared = await Clipboard.aggregate([
      { 
        $match: { 
          ...baseQuery,
          'sharedWith.0': { $exists: true }
        } 
      },
      {
        $project: {
          content: { $substr: ['$content', 0, 100] },
          type: 1,
          sharedCount: { $size: '$sharedWith' },
          createdAt: 1
        }
      },
      { $sort: { sharedCount: -1 } },
      { $limit: 10 }
    ]);

    // Get user sharing activity
    const userSharing = await Clipboard.aggregate([
      { 
        $match: { 
          ...baseQuery,
          'sharedWith.0': { $exists: true },
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: "$createdBy",
          totalShares: { $sum: { $size: '$sharedWith' } },
          uniqueEntries: { $addToSet: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          userId: '$_id',
          username: { $arrayElemAt: ['$user.username', 0] },
          totalShares: 1,
          uniqueEntries: { $size: '$uniqueEntries' }
        }
      },
      { $sort: { totalShares: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      period,
      dateRange: { start: startDate, end: now },
      analytics: {
        sharing: sharingAnalytics,
        topShared,
        userSharing,
        summary: {
          totalShares: sharingAnalytics.reduce((sum, day) => sum + day.totalShares, 0),
          totalEntries: sharingAnalytics.reduce((sum, day) => sum + day.totalEntries, 0),
          averageSharesPerEntry: sharingAnalytics.reduce((sum, day) => sum + day.totalShares, 0) / 
                                Math.max(sharingAnalytics.reduce((sum, day) => sum + day.totalEntries, 0), 1)
        }
      }
    });
  } catch (error) {
    console.error('Get share analytics error:', error);
    res.status(500).json({ error: 'Failed to get share analytics' });
  }
});

// @route   POST /api/shares/template
// @desc    Create a share template
// @access  Private
router.post('/template', authenticateToken, async (req, res) => {
  try {
    const { name, description, defaultAccessLevel, defaultMessage, productId } = req.body;
    const currentUserId = req.user._id;

    if (!name || !productId) {
      return res.status(400).json({ error: 'Name and productId are required' });
    }

    // Check if user has access to the product
    if (!req.user.hasProductAccess(productId, 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Create share template
    const template = {
      name,
      description: description || '',
      defaultAccessLevel: defaultAccessLevel || 'read',
      defaultMessage: defaultMessage || '',
      productId,
      createdBy: currentUserId,
      createdAt: new Date(),
      isActive: true
    };

    // Add to user's share templates
    const user = await User.findById(currentUserId);
    if (!user.shareTemplates) {
      user.shareTemplates = [];
    }
    
    user.shareTemplates.push(template);
    await user.save();

    res.status(201).json({
      message: 'Share template created successfully',
      template
    });
  } catch (error) {
    console.error('Create share template error:', error);
    res.status(500).json({ error: 'Failed to create share template' });
  }
});

// @route   GET /api/shares/templates
// @desc    Get user's share templates
// @access  Private
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.query;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let templates = user.shareTemplates || [];

    // Filter by product if specified
    if (productId) {
      templates = templates.filter(template => 
        template.productId === productId && template.isActive
      );
    } else {
      templates = templates.filter(template => template.isActive);
    }

    res.json({ templates });
  } catch (error) {
    console.error('Get share templates error:', error);
    res.status(500).json({ error: 'Failed to get share templates' });
  }
});

// @route   PUT /api/shares/template/:templateId
// @desc    Update a share template
// @access  Private
router.put('/template/:templateId', authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { name, description, defaultAccessLevel, defaultMessage, isActive } = req.body;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const template = user.shareTemplates.id(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update template fields
    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    if (defaultAccessLevel !== undefined) template.defaultAccessLevel = defaultAccessLevel;
    if (defaultMessage !== undefined) template.defaultMessage = defaultMessage;
    if (isActive !== undefined) template.isActive = isActive;

    template.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Share template updated successfully',
      template
    });
  } catch (error) {
    console.error('Update share template error:', error);
    res.status(500).json({ error: 'Failed to update share template' });
  }
});

// @route   DELETE /api/shares/template/:templateId
// @desc    Delete a share template
// @access  Private
router.delete('/template/:templateId', authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const template = user.shareTemplates.id(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Remove template
    user.shareTemplates.pull(templateId);
    await user.save();

    res.json({ message: 'Share template deleted successfully' });
  } catch (error) {
    console.error('Delete share template error:', error);
    res.status(500).json({ error: 'Failed to delete share template' });
  }
});

module.exports = router;
