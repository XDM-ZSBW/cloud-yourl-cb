const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateProductCreate = [
  body('productName').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('maxUsers').optional().isInt({ min: 1, max: 1000 }),
  body('features').optional().isArray(),
  body('settings').optional().isObject()
];

const validateProductUpdate = [
  body('productName').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('maxUsers').optional().isInt({ min: 1, max: 1000 }),
  body('features').optional().isArray(),
  body('settings').optional().isObject(),
  body('status').optional().isIn(['active', 'inactive', 'maintenance'])
];

const validateUserAccess = [
  body('userId').isMongoId(),
  body('accessLevel').isIn(['read', 'write', 'admin']),
  body('expiresAt').optional().isISO8601()
];

// @route   GET /api/products
// @desc    Get products accessible to current user
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { page = 1, limit = 50, status } = req.query;
    const skip = (page - 1) * limit;

    // Build query for user's accessible products
    const query = {
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId },
        { 'invitedUsers.userId': currentUserId }
      ]
    };

    if (status) {
      query.status = status;
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('owner', 'username firstName lastName profile.avatar')
      .populate('members.userId', 'username firstName lastName profile.avatar')
      .populate('invitedUsers.userId', 'username firstName lastName profile.avatar');

    // Get total count
    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// @route   POST /api/products
// @desc    Create a new product
// @access  Private
router.post('/', validateProductCreate, authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productName, description, maxUsers, features, settings } = req.body;
    const currentUserId = req.user._id;

    // Check if user already has a product with this name
    const existingProduct = await Product.findOne({
      owner: currentUserId,
      productName: { $regex: new RegExp(`^${productName}$`, 'i') }
    });

    if (existingProduct) {
      return res.status(400).json({ error: 'You already have a product with this name' });
    }

    // Create new product
    const product = new Product({
      productName,
      description,
      owner: currentUserId,
      members: [{ userId: currentUserId, accessLevel: 'admin', joinedAt: new Date() }],
      maxUsers: maxUsers || 10,
      features: features || ['clipboard', 'sharing', 'sync'],
      settings: settings || {
        allowPublicSharing: false,
        requireApproval: false,
        maxClipboardSize: 10485760, // 10MB
        retentionDays: 365
      }
    });

    await product.save();

    // Update user's product access
    const user = await User.findById(currentUserId);
    await user.addProductAccess(product.productId, product.productName, 'admin');

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// @route   GET /api/products/:productId
// @desc    Get product details
// @access  Private
router.get('/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId },
        { 'invitedUsers.userId': currentUserId }
      ]
    })
    .populate('owner', 'username firstName lastName profile.avatar')
    .populate('members.userId', 'username firstName lastName profile.avatar')
    .populate('invitedUsers.userId', 'username firstName lastName profile.avatar');

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// @route   PUT /api/products/:productId
// @desc    Update product
// @access  Private
router.put('/:productId', validateProductUpdate, authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params;
    const currentUserId = req.user._id;
    const updateData = req.body;

    const product = await Product.findOne({
      productId,
      owner: currentUserId
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Update allowed fields
    const allowedFields = ['productName', 'description', 'maxUsers', 'features', 'settings', 'status'];
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        product[field] = updateData[field];
      }
    }

    await product.save();

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// @route   DELETE /api/products/:productId
// @desc    Delete product
// @access  Private
router.delete('/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      owner: currentUserId
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Check if product has active users
    if (product.userCount > 1) {
      return res.status(400).json({ 
        error: 'Cannot delete product with active users. Please remove all users first.' 
      });
    }

    // Remove product access from all users
    await User.updateMany(
      { 'productAccess.productId': productId },
      { $pull: { productAccess: { productId } } }
    );

    // Delete the product
    await Product.findByIdAndDelete(product._id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// @route   POST /api/products/:productId/invite
// @desc    Invite user to product
// @access  Private
router.post('/:productId/invite', validateUserAccess, authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params;
    const { userId, accessLevel, expiresAt, message } = req.body;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId, 'members.accessLevel': 'admin' }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Check if user is already a member
    if (product.members.some(member => member.userId.toString() === userId)) {
      return res.status(400).json({ error: 'User is already a member of this product' });
    }

    // Check if user is already invited
    if (product.invitedUsers.some(invite => invite.userId.toString() === userId)) {
      return res.status(400).json({ error: 'User is already invited to this product' });
    }

    // Check if product has reached max users
    if (product.members.length >= product.maxUsers) {
      return res.status(400).json({ error: 'Product has reached maximum user limit' });
    }

    // Add to invited users
    product.invitedUsers.push({
      userId,
      accessLevel,
      invitedBy: currentUserId,
      invitedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
      message
    });

    await product.save();

    res.json({
      message: 'User invited successfully',
      invite: product.invitedUsers[product.invitedUsers.length - 1]
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// @route   POST /api/products/:productId/join
// @desc    Join product with invite code
// @access  Private
router.post('/:productId/join', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { inviteCode } = req.body;
    const currentUserId = req.user._id;

    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user is already a member
    if (product.members.some(member => member.userId.toString() === currentUserId.toString())) {
      return res.status(400).json({ error: 'You are already a member of this product' });
    }

    // Check if product is accepting users
    if (!product.canAcceptUsers) {
      return res.status(400).json({ error: 'Product is not accepting new users' });
    }

    // Check if product has reached max users
    if (product.members.length >= product.maxUsers) {
      return res.status(400).json({ error: 'Product has reached maximum user limit' });
    }

    // Add user to product
    product.members.push({
      userId: currentUserId,
      accessLevel: 'read',
      joinedAt: new Date()
    });

    await product.save();

    // Update user's product access
    const user = await User.findById(currentUserId);
    await user.addProductAccess(productId, product.productName, 'read');

    res.json({
      message: 'Successfully joined product',
      product: {
        productId: product.productId,
        productName: product.productName,
        accessLevel: 'read'
      }
    });
  } catch (error) {
    console.error('Join product error:', error);
    res.status(500).json({ error: 'Failed to join product' });
  }
});

// @route   PUT /api/products/:productId/members/:userId
// @desc    Update member access level
// @access  Private
router.put('/:productId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { productId, userId } = req.params;
    const { accessLevel } = req.body;
    const currentUserId = req.user._id;

    if (!['read', 'write', 'admin'].includes(accessLevel)) {
      return res.status(400).json({ error: 'Invalid access level' });
    }

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId, 'members.accessLevel': 'admin' }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Find member to update
    const memberIndex = product.members.findIndex(member => 
      member.userId.toString() === userId
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Prevent removing the last admin
    if (accessLevel !== 'admin' && product.members.filter(m => m.accessLevel === 'admin').length === 1) {
      const member = product.members[memberIndex];
      if (member.accessLevel === 'admin') {
        return res.status(400).json({ error: 'Cannot remove the last admin from the product' });
      }
    }

    // Update access level
    product.members[memberIndex].accessLevel = accessLevel;
    product.members[memberIndex].updatedAt = new Date();

    await product.save();

    // Update user's product access
    await User.updateOne(
      { _id: userId, 'productAccess.productId': productId },
      { $set: { 'productAccess.$.accessLevel': accessLevel } }
    );

    res.json({
      message: 'Member access level updated successfully',
      member: product.members[memberIndex]
    });
  } catch (error) {
    console.error('Update member access error:', error);
    res.status(500).json({ error: 'Failed to update member access' });
  }
});

// @route   DELETE /api/products/:productId/members/:userId
// @desc    Remove member from product
// @access  Private
router.delete('/:productId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { productId, userId } = req.params;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId, 'members.accessLevel': 'admin' }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Prevent removing the owner
    if (product.owner.toString() === userId) {
      return res.status(400).json({ error: 'Cannot remove the product owner' });
    }

    // Find member to remove
    const memberIndex = product.members.findIndex(member => 
      member.userId.toString() === userId
    );

    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Prevent removing the last admin
    if (product.members[memberIndex].accessLevel === 'admin' && 
        product.members.filter(m => m.accessLevel === 'admin').length === 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin from the product' });
    }

    // Remove member
    product.members.splice(memberIndex, 1);
    await product.save();

    // Remove product access from user
    await User.updateOne(
      { _id: userId },
      { $pull: { productAccess: { productId } } }
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// @route   GET /api/products/:productId/stats
// @desc    Get product statistics
// @access  Private
router.get('/:productId/stats', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Get clipboard statistics
    const Clipboard = require('../models/Clipboard');
    const clipboardStats = await Clipboard.aggregate([
      { $match: { productId } },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          textEntries: { $sum: { $cond: [{ $eq: ['$type', 'text'] }, 1, 0] } },
          imageEntries: { $sum: { $cond: [{ $eq: ['$type', 'image'] }, 1, 0] } },
          fileEntries: { $sum: { $cond: [{ $eq: ['$type', 'file'] }, 1, 0] } },
          linkEntries: { $sum: { $cond: [{ $eq: ['$type', 'link'] }, 1, 0] } },
          totalFavorites: { $sum: { $size: '$favoritedBy' } }
        }
      }
    ]);

    // Get user activity
    const recentActivity = await Clipboard.find({ productId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('content type createdAt createdBy')
      .populate('createdBy', 'username');

    res.json({
      product: {
        productId: product.productId,
        productName: product.productName,
        description: product.description,
        status: product.status,
        userCount: product.members.length,
        maxUsers: product.maxUsers,
        createdAt: product.createdAt
      },
      stats: clipboardStats[0] || {
        totalEntries: 0,
        textEntries: 0,
        imageEntries: 0,
        fileEntries: 0,
        linkEntries: 0,
        totalFavorites: 0
      },
      recentActivity
    });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'Failed to get product statistics' });
  }
});

// @route   GET /api/products/:productId/analytics
// @desc    Get detailed product analytics
// @access  Private
router.get('/:productId/analytics', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { period = '30d' } = req.query;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId, 'members.accessLevel': { $in: ['admin', 'write'] } }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

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

    // Get clipboard analytics
    const Clipboard = require('../models/Clipboard');
    const clipboardAnalytics = await Clipboard.aggregate([
      { 
        $match: { 
          productId,
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          types: {
            $push: {
              type: "$_id.type",
              count: "$count"
            }
          },
          total: { $sum: "$count" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get user activity analytics
    const userActivity = await Clipboard.aggregate([
      { 
        $match: { 
          productId,
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: "$createdBy",
          entries: { $sum: 1 },
          lastActivity: { $max: "$createdAt" }
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
          entries: 1,
          lastActivity: 1
        }
      },
      { $sort: { entries: -1 } }
    ]);

    res.json({
      productId,
      period,
      dateRange: { start: startDate, end: now },
      analytics: {
        clipboard: clipboardAnalytics,
        userActivity,
        summary: {
          totalEntries: clipboardAnalytics.reduce((sum, day) => sum + day.total, 0),
          activeUsers: userActivity.length,
          averageEntriesPerUser: userActivity.length > 0 ? 
            (clipboardAnalytics.reduce((sum, day) => sum + day.total, 0) / userActivity.length).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    console.error('Get product analytics error:', error);
    res.status(500).json({ error: 'Failed to get product analytics' });
  }
});

// @route   POST /api/products/:productId/export
// @desc    Export product data
// @access  Private
router.post('/:productId/export', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { format = 'json', includeContent = true } = req.body;
    const currentUserId = req.user._id;

    const product = await Product.findOne({
      productId,
      $or: [
        { owner: currentUserId },
        { 'members.userId': currentUserId, 'members.accessLevel': { $in: ['admin', 'write'] } }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    // Get clipboard entries
    const Clipboard = require('../models/Clipboard');
    const entries = await Clipboard.find({ productId })
      .populate('createdBy', 'username firstName lastName')
      .populate('lastModifiedBy', 'username firstName lastName')
      .sort({ createdAt: -1 });

    // Prepare export data
    const exportData = {
      product: {
        productId: product.productId,
        productName: product.productName,
        description: product.description,
        status: product.status,
        createdAt: product.createdAt,
        members: product.members.length,
        maxUsers: product.maxUsers
      },
      entries: entries.map(entry => ({
        id: entry._id,
        content: includeContent ? entry.content : '[Content Excluded]',
        type: entry.type,
        tags: entry.tags,
        isPublic: entry.isPublic,
        createdBy: entry.createdBy?.username || 'Unknown',
        createdAt: entry.createdAt,
        lastModifiedBy: entry.lastModifiedBy?.username || 'Unknown',
        lastModifiedAt: entry.lastModifiedAt,
        favoritedBy: entry.favoritedBy.length,
        sharedWith: entry.sharedWith.length
      })),
      exportInfo: {
        exportedAt: new Date(),
        exportedBy: currentUserId,
        format,
        totalEntries: entries.length
      }
    };

    if (format === 'csv') {
      // TODO: Implement CSV export
      res.json({ message: 'CSV export not yet implemented', data: exportData });
    } else {
      res.json({
        message: 'Product data exported successfully',
        data: exportData
      });
    }
  } catch (error) {
    console.error('Export product error:', error);
    res.status(500).json({ error: 'Failed to export product data' });
  }
});

module.exports = router;
