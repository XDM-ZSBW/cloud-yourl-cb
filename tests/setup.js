// Test setup file for Jest
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/cb-yourl-cloud-test';

// Global test utilities
global.testUtils = {
  // Mock JWT token for testing
  mockJWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NTQzMjEwOTg3NjU0MzIxMDk4NzY1NDMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTczMTUzNjAwMH0.test-signature',
  
  // Sample test data
  sampleUser: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
  },
  
  sampleProduct: {
    name: 'Test Product',
    description: 'A test product for testing purposes',
  },
  
  sampleClipboardEntry: {
    content: 'Test clipboard content',
    type: 'text',
    tags: ['test', 'sample'],
    productId: '654321098765432109876543',
  },
  
  // Helper function to create test user data
  createTestUser: (overrides = {}) => ({
    ...global.testUtils.sampleUser,
    ...overrides,
  }),
  
  // Helper function to create test product data
  createTestProduct: (overrides = {}) => ({
    ...global.testUtils.sampleProduct,
    ...overrides,
  }),
  
  // Helper function to create test clipboard entry data
  createTestClipboardEntry: (overrides = {}) => ({
    ...global.testUtils.sampleClipboardEntry,
    ...overrides,
  }),
};

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase timeout for database operations
jest.setTimeout(10000);
