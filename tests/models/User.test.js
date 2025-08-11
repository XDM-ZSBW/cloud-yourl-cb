const mongoose = require('mongoose');
const User = require('../../src/models/User');
const bcrypt = require('bcryptjs');

// Mock the User model for testing
jest.mock('../../src/models/User');

describe('User Model', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    // Close database connection
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Clear test database
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    it('should create a new user with valid data', async () => {
      const userData = global.testUtils.createTestUser();
      
      const user = new User(userData);
      const savedUser = await user.save();
      
      expect(savedUser._id).toBeDefined();
      expect(savedUser.username).toBe(userData.username);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.lastName).toBe(userData.lastName);
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it('should hash password before saving', async () => {
      const userData = global.testUtils.createTestUser();
      
      const user = new User(userData);
      await user.save();
      
      // Password should be hashed
      expect(user.password).not.toBe(userData.password);
      
      // Should be able to verify password
      const isValidPassword = await bcrypt.compare(userData.password, user.password);
      expect(isValidPassword).toBe(true);
    });

    it('should require username', async () => {
      const userData = global.testUtils.createTestUser();
      delete userData.username;
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.username).toBeDefined();
      }
    });

    it('should require email', async () => {
      const userData = global.testUtils.createTestUser();
      delete userData.email;
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.email).toBeDefined();
      }
    });

    it('should require password', async () => {
      const userData = global.testUtils.createTestUser();
      delete userData.password;
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.password).toBeDefined();
      }
    });
  });

  describe('User Validation', () => {
    it('should validate email format', async () => {
      const userData = global.testUtils.createTestUser({
        email: 'invalid-email',
      });
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.email).toBeDefined();
      }
    });

    it('should validate username length', async () => {
      const userData = global.testUtils.createTestUser({
        username: 'ab', // Too short
      });
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.username).toBeDefined();
      }
    });

    it('should validate password length', async () => {
      const userData = global.testUtils.createTestUser({
        password: '123', // Too short
      });
      
      const user = new User(userData);
      
      try {
        await user.save();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.password).toBeDefined();
      }
    });
  });

  describe('User Methods', () => {
    it('should compare password correctly', async () => {
      const userData = global.testUtils.createTestUser();
      const user = new User(userData);
      await user.save();
      
      const isValidPassword = await user.comparePassword(userData.password);
      expect(isValidPassword).toBe(true);
      
      const isInvalidPassword = await user.comparePassword('wrongpassword');
      expect(isInvalidPassword).toBe(false);
    });

    it('should generate auth token', async () => {
      const userData = global.testUtils.createTestUser();
      const user = new User(userData);
      await user.save();
      
      const token = user.generateAuthToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('User Queries', () => {
    beforeEach(async () => {
      // Create test users
      const users = [
        global.testUtils.createTestUser({ username: 'user1', email: 'user1@example.com' }),
        global.testUtils.createTestUser({ username: 'user2', email: 'user2@example.com' }),
        global.testUtils.createTestUser({ username: 'user3', email: 'user3@example.com' }),
      ];
      
      for (const userData of users) {
        const user = new User(userData);
        await user.save();
      }
    });

    it('should find user by email', async () => {
      const foundUser = await User.findOne({ email: 'user1@example.com' });
      expect(foundUser).toBeDefined();
      expect(foundUser.username).toBe('user1');
    });

    it('should find user by username', async () => {
      const foundUser = await User.findOne({ username: 'user2' });
      expect(foundUser).toBeDefined();
      expect(foundUser.email).toBe('user2@example.com');
    });

    it('should return null for non-existent user', async () => {
      const foundUser = await User.findOne({ email: 'nonexistent@example.com' });
      expect(foundUser).toBeNull();
    });
  });
});
