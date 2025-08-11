const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Check if user has access to any registered product line
    if (!user.productAccess || user.productAccess.length === 0) {
      return res.status(403).json({ error: 'No product access granted' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const authenticateAdmin = async (req, res, next) => {
  try {
    await authenticateToken(req, res, () => {});
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

const authenticateFamilyMember = async (req, res, next) => {
  try {
    await authenticateToken(req, res, () => {});
    
    if (!['admin', 'family', 'friend'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Family or friend access required' });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateToken,
  authenticateAdmin,
  authenticateFamilyMember
};
