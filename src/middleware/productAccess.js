const User = require('../models/User');
const Product = require('../models/Product');

const validateProductAccess = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Get user's product access
    const user = await User.findById(userId).populate('productAccess');
    
    if (!user.productAccess || user.productAccess.length === 0) {
      return res.status(403).json({ error: 'No product access granted' });
    }

    // Check if user has access to the specific product
    const hasAccess = user.productAccess.some(product => 
      product._id.toString() === productId || 
      product.productId === productId
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this product' });
    }

    // Add product info to request for later use
    req.userProduct = user.productAccess.find(product => 
      product._id.toString() === productId || 
      product.productId === productId
    );

    next();
  } catch (error) {
    console.error('Product access validation error:', error);
    res.status(500).json({ error: 'Product access validation failed' });
  }
};

const validateFamilyAccess = async (req, res, next) => {
  try {
    const { targetUserId } = req.params;
    const currentUser = req.user;

    // Admins can access everything
    if (currentUser.role === 'admin') {
      return next();
    }

    // Check if target user is in the same family group
    if (currentUser.familyGroup && 
        currentUser.familyGroup.toString() === targetUserId) {
      return next();
    }

    // Check if users are friends
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const areFriends = currentUser.friends.includes(targetUserId) || 
                      targetUser.friends.includes(currentUser._id);

    if (!areFriends) {
      return res.status(403).json({ error: 'Access denied - not family or friend' });
    }

    next();
  } catch (error) {
    console.error('Family access validation error:', error);
    res.status(500).json({ error: 'Family access validation failed' });
  }
};

const validateClipboardAccess = async (req, res, next) => {
  try {
    const { clipboardId } = req.params;
    const currentUser = req.user;

    // Admins can access everything
    if (currentUser.role === 'admin') {
      return next();
    }

    // Check if user owns the clipboard entry
    const Clipboard = require('../models/Clipboard');
    const clipboardEntry = await Clipboard.findById(clipboardId);
    
    if (!clipboardEntry) {
      return res.status(404).json({ error: 'Clipboard entry not found' });
    }

    if (clipboardEntry.userId.toString() === currentUser._id.toString()) {
      return next();
    }

    // Check if user has been shared with this clipboard
    if (clipboardEntry.sharedWith.includes(currentUser._id)) {
      return next();
    }

    // Check if users are in the same family group
    if (currentUser.familyGroup && 
        clipboardEntry.familyGroup && 
        currentUser.familyGroup.toString() === clipboardEntry.familyGroup.toString()) {
      return next();
    }

    return res.status(403).json({ error: 'Access denied to this clipboard entry' });
  } catch (error) {
    console.error('Clipboard access validation error:', error);
    res.status(500).json({ error: 'Clipboard access validation failed' });
  }
};

module.exports = {
  validateProductAccess,
  validateFamilyAccess,
  validateClipboardAccess
};
