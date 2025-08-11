const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["https://cb.yourl.cloud", "https://yourl.cloud"],
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ["https://cb.yourl.cloud", "https://yourl.cloud"],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
const authRoutes = require('./routes/auth');
const clipboardRoutes = require('./routes/clipboard');
const userRoutes = require('./routes/users');
const shareRoutes = require('./routes/shares');
const productRoutes = require('./routes/products');
const systemRoutes = require('./routes/system');
const utilityRoutes = require('./routes/utilities');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { validateProductAccess } = require('./middleware/productAccess');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clipboard', authenticateToken, clipboardRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/shares', authenticateToken, shareRoutes);
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/utilities', authenticateToken, utilityRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'cb-yourl-cloud',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'cb-yourl-cloud API',
    version: '1.0.0',
    description: 'Secure clipboard history service for friends and family',
    endpoints: {
      auth: '/api/auth',
      clipboard: '/api/clipboard',
      users: '/api/users',
      shares: '/api/shares',
      products: '/api/products',
      system: '/api/system',
      utilities: '/api/utilities'
    },
    documentation: 'https://cb.yourl.cloud/docs',
    status: 'operational'
  });
});

// Socket.IO connection handling
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  // Verify token here
  next();
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });
  
  socket.on('clipboard-update', (data) => {
    socket.to(data.roomId).emit('clipboard-updated', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 cb.yourl.cloud server running on ${HOST}:${PORT}`);
  console.log(`📋 Clipboard history service for friends and family`);
  console.log(`🔒 Secure access control enabled`);
});

module.exports = { app, server, io };
