const express = require('express');
const { body, validationResult } = require('express-validator');
const Clipboard = require('../models/Clipboard');
const { authenticateToken } = require('../middleware/auth');
const { validateProductAccess } = require('../middleware/productAccess');

const router = express.Router();

// Validation middleware
const validateClipboardEntry = [
  body('content').notEmpty().trim(),
  body('type').isIn(['text', 'image', 'file', 'link']),
  body('productId').notEmpty(),
  body('tags').optional().isArray(),
  body('isPublic').optional().isBoolean()
];

// @route   POST /api/clipboard
// @desc    Create a new clipboard entry
// @access  Private
router.post('/', validateClipboardEntry, validateProductAccess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, type, productId, tags, isPublic, metadata } = req.body;
    const userId = req.user._id;

    // Create clipboard entry
    const clipboardEntry = new Clipboard({
      content,
      type,
      productId,
      createdBy: userId,
      tags: tags || [],
      isPublic: isPublic || false,
      metadata: metadata || {}
    });

    await clipboardEntry.save();

    // Emit real-time update via Socket.IO
    req.app.get('io').to(productId).emit('clipboard-updated', {
      action: 'created',
      entry: clipboardEntry,
      productId
    });

    res.status(201).json({
      message: 'Clipboard entry created successfully',
      entry: clipboardEntry
    });
  } catch (error) {
    console.error('Create clipboard entry error:', error);
    res.status(500).json({ error: 'Failed to create clipboard entry' });
  }
});

// @route   GET /api/clipboard
// @desc    Get clipboard entries for a product
// @access  Private
router.get('/', validateProductAccess, async (req, res) => {
  try {
    const { productId, page = 1, limit = 50, type, tags, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const userId = req.user._id;

    // Build query
    const query = { productId };
    
    // Filter by type if specified
    if (type) {
      query.type = type;
    }
    
    // Filter by tags if specified
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    
    // Search in content if specified
    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (page - 1) * limit;

    // Get entries
    const entries = await Clipboard.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username firstName lastName')
      .populate('lastModifiedBy', 'username firstName lastName');

    // Get total count
    const total = await Clipboard.countDocuments(query);

    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get clipboard entries error:', error);
    res.status(500).json({ error: 'Failed to get clipboard entries' });
  }
});

// @route   GET /api/clipboard/:id
// @desc    Get a specific clipboard entry
// @access  Private
router.get('/:id', validateProductAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.query;

    const entry = await Clipboard.findOne({
      _id: id,
      productId
    }).populate('createdBy', 'username firstName lastName')
      .populate('lastModifiedBy', 'username firstName lastName');

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Get clipboard entry error:', error);
    res.status(500).json({ error: 'Failed to get clipboard entry' });
  }
});

// @route   PUT /api/clipboard/:id
// @desc    Update a clipboard entry
// @access  Private
router.put('/:id', validateClipboardEntry, validateProductAccess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { content, type, tags, isPublic, metadata } = req.body;
    const { productId } = req.query;
    const userId = req.user._id;

    const entry = await Clipboard.findOne({
      _id: id,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has write access
    if (!req.user.hasProductAccess(productId, 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Update entry
    entry.content = content;
    entry.type = type;
    entry.tags = tags || entry.tags;
    entry.isPublic = isPublic !== undefined ? isPublic : entry.isPublic;
    entry.metadata = metadata || entry.metadata;
    entry.lastModifiedBy = userId;
    entry.lastModifiedAt = new Date();

    await entry.save();

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-updated', {
      action: 'updated',
      entry,
      productId
    });

    res.json({
      message: 'Clipboard entry updated successfully',
      entry
    });
  } catch (error) {
    console.error('Update clipboard entry error:', error);
    res.status(500).json({ error: 'Failed to update clipboard entry' });
  }
});

// @route   DELETE /api/clipboard/:id
// @desc    Delete a clipboard entry
// @access  Private
router.delete('/:id', validateProductAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.query;
    const userId = req.user._id;

    const entry = await Clipboard.findOne({
      _id: id,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Check if user has write access or is the creator
    if (!req.user.hasProductAccess(productId, 'write') && entry.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await Clipboard.findByIdAndDelete(id);

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-updated', {
      action: 'deleted',
      entryId: id,
      productId
    });

    res.json({ message: 'Clipboard entry deleted successfully' });
  } catch (error) {
    console.error('Delete clipboard entry error:', error);
    res.status(500).json({ error: 'Failed to delete clipboard entry' });
  }
});

// @route   POST /api/clipboard/:id/favorite
// @desc    Toggle favorite status of a clipboard entry
// @access  Private
router.post('/:id/favorite', validateProductAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.query;
    const userId = req.user._id;

    const entry = await Clipboard.findOne({
      _id: id,
      productId
    });

    if (!entry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    // Toggle favorite
    const isFavorited = entry.favoritedBy.includes(userId);
    
    if (isFavorited) {
      entry.favoritedBy = entry.favoritedBy.filter(id => id.toString() !== userId.toString());
    } else {
      entry.favoritedBy.push(userId);
    }

    await entry.save();

    res.json({
      message: `Entry ${isFavorited ? 'unfavorited' : 'favorited'} successfully`,
      isFavorited: !isFavorited
    });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// @route   GET /api/clipboard/stats
// @desc    Get clipboard statistics for a product
// @access  Private
router.get('/stats', validateProductAccess, async (req, res) => {
  try {
    const { productId } = req.query;

    const stats = await Clipboard.aggregate([
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

    const recentActivity = await Clipboard.find({ productId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('content type createdAt createdBy')
      .populate('createdBy', 'username');

    res.json({
      stats: stats[0] || {
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
    console.error('Get clipboard stats error:', error);
    res.status(500).json({ error: 'Failed to get clipboard statistics' });
  }
});

// @route   GET /api/clipboard/search
// @desc    Search clipboard entries
// @access  Private
router.get('/search', validateProductAccess, async (req, res) => {
  try {
    const { productId, q, type, tags, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    // Build search query
    const query = { productId };
    
    // Text search
    if (q) {
      query.$text = { $search: q };
    }
    
    // Type filter
    if (type) {
      query.type = type;
    }
    
    // Tags filter
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Pagination
    const skip = (page - 1) * limit;

    // Execute search
    const entries = await Clipboard.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username firstName lastName')
      .populate('lastModifiedBy', 'username firstName lastName');

    // Get total count
    const total = await Clipboard.countDocuments(query);

    // Get search suggestions
    const suggestions = await Clipboard.aggregate([
      { $match: { productId } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      suggestions: suggestions.map(s => s._id),
      searchQuery: { q, type, tags, dateFrom, dateTo }
    });
  } catch (error) {
    console.error('Search clipboard error:', error);
    res.status(500).json({ error: 'Failed to search clipboard entries' });
  }
});

// @route   GET /api/clipboard/history
// @desc    Get clipboard history for a user
// @access  Private
router.get('/history', validateProductAccess, async (req, res) => {
  try {
    const { productId, page = 1, limit = 50, type } = req.query;
    const userId = req.user._id;

    // Build query
    const query = { productId };
    
    // Filter by type if specified
    if (type) {
      query.type = type;
    }

    // Pagination
    const skip = (page - 1) * limit;

    // Get user's clipboard history
    const history = await Clipboard.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username firstName lastName')
      .populate('lastModifiedBy', 'username firstName lastName');

    // Get total count
    const total = await Clipboard.countDocuments(query);

    // Get history statistics
    const stats = await Clipboard.aggregate([
      { $match: { productId } },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          uniqueTypes: { $addToSet: '$type' },
          uniqueTags: { $addToSet: '$tags' },
          averageTags: { $avg: { $size: '$tags' } }
        }
      }
    ]);

    res.json({
      history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: stats[0] || {
        totalEntries: 0,
        uniqueTypes: [],
        uniqueTags: [],
        averageTags: 0
      }
    });
  } catch (error) {
    console.error('Get clipboard history error:', error);
    res.status(500).json({ error: 'Failed to get clipboard history' });
  }
});

// @route   POST /api/clipboard/bulk
// @desc    Create multiple clipboard entries
// @access  Private
router.post('/bulk', validateProductAccess, async (req, res) => {
  try {
    const { entries, productId } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    if (entries.length > 100) {
      return res.status(400).json({ error: 'Cannot create more than 100 entries at once' });
    }

    // Validate each entry
    const validEntries = [];
    for (const entry of entries) {
      if (entry.content && entry.type) {
        validEntries.push({
          content: entry.content,
          type: entry.type,
          productId,
          createdBy: userId,
          tags: entry.tags || [],
          isPublic: entry.isPublic || false,
          metadata: entry.metadata || {}
        });
      }
    }

    if (validEntries.length === 0) {
      return res.status(400).json({ error: 'No valid entries found' });
    }

    // Create entries
    const createdEntries = await Clipboard.insertMany(validEntries);

    // Emit real-time update
    req.app.get('io').to(productId).emit('clipboard-bulk-created', {
      action: 'bulk_created',
      entries: createdEntries,
      productId
    });

    res.status(201).json({
      message: `${createdEntries.length} clipboard entries created successfully`,
      entries: createdEntries
    });
  } catch (error) {
    console.error('Bulk create clipboard error:', error);
    res.status(500).json({ error: 'Failed to create clipboard entries' });
  }
});

module.exports = router;
