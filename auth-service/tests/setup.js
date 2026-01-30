// Test setup file
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_auth_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.BCRYPT_ROUNDS = '4'; // Faster bcrypt for tests

// Mock console methods to reduce test output noise
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  // Helper to generate test user data
  createTestUser: (overrides = {}) => ({
    email: 'test@example.com',
    password: 'TestPassword123!',
    role: 'user',
    ...overrides
  }),
  
  // Helper to generate test organization data
  createTestOrg: (overrides = {}) => ({
    org_name: 'Test Organization',
    admin_email: 'admin@test.com',
    admin_password: 'AdminPassword123!',
    ...overrides
  }),
  
  // Helper to create mock request object
  createMockReq: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    org_id: null,
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    get: jest.fn(),
    ...overrides
  }),
  
  // Helper to create mock response object
  createMockRes: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      locals: {},
      headersSent: false
    };
    return res;
  },
  
  // Helper to create mock next function
  createMockNext: () => jest.fn(),
  
  // Helper to wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate UUID for tests
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

// Mock external dependencies that are commonly used
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock database pool to prevent actual database connections during tests
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
}));

// Increase timeout for integration tests
jest.setTimeout(30000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});