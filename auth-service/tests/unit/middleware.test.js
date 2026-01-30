const request = require('supertest');
const express = require('express');
const { validateHMAC, validateJWT, errorHandler, requestLogger, roleAuth } = require('../../src/middleware');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('../../src/persistence/orgRepository');
jest.mock('../../src/persistence/userRepository');
jest.mock('../../src/services/cryptoService');
jest.mock('../../src/services/tokenService');
jest.mock('../../src/utils/logger');

const orgRepository = require('../../src/persistence/orgRepository');
const userRepository = require('../../src/persistence/userRepository');
const cryptoService = require('../../src/services/cryptoService');
const tokenService = require('../../src/services/tokenService');
const logger = require('../../src/utils/logger');

describe('Middleware Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
    
    // Mock logger methods
    logger.debug = jest.fn();
    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
  });

  describe('validateHMAC middleware', () => {
    beforeEach(() => {
      app.use(validateHMAC);
      app.get('/test', (req, res) => {
        res.json({ success: true, orgId: req.org_id });
      });
      app.use(errorHandler);
    });

    test('should pass with valid HMAC headers', async () => {
      const mockOrg = {
        id: 'org-123',
        name: 'Test Org',
        client_secret_hash: 'hashed-secret',
        is_active: true
      };

      orgRepository.findByClientIdHash.mockResolvedValue(mockOrg);
      cryptoService.verifyHMAC.mockReturnValue(true);

      const timestamp = Date.now().toString();
      const response = await request(app)
        .get('/test')
        .set({
          'X-Client-ID': 'test-client-id',
          'X-Timestamp': timestamp,
          'X-Signature': 'valid-signature'
        })
        .expect(200);

      expect(response.body).toEqual({ success: true, orgId: 'org-123' });
      expect(orgRepository.findByClientIdHash).toHaveBeenCalled();
      expect(cryptoService.verifyHMAC).toHaveBeenCalled();
    });

    test('should fail with missing headers', async () => {
      await request(app)
        .get('/test')
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'HMAC validation failed: Missing required headers',
        expect.any(Object)
      );
    });

    test('should fail with expired timestamp', async () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      
      await request(app)
        .get('/test')
        .set({
          'X-Client-ID': 'test-client-id',
          'X-Timestamp': oldTimestamp,
          'X-Signature': 'valid-signature'
        })
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'HMAC validation failed: Invalid or expired timestamp',
        expect.any(Object)
      );
    });

    test('should fail with invalid client ID', async () => {
      orgRepository.findByClientIdHash.mockResolvedValue(null);

      const timestamp = Date.now().toString();
      await request(app)
        .get('/test')
        .set({
          'X-Client-ID': 'invalid-client-id',
          'X-Timestamp': timestamp,
          'X-Signature': 'valid-signature'
        })
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'HMAC validation failed: Invalid client ID',
        expect.any(Object)
      );
    });

    test('should fail with invalid signature', async () => {
      const mockOrg = {
        id: 'org-123',
        name: 'Test Org',
        client_secret_hash: 'hashed-secret',
        is_active: true
      };

      orgRepository.findByClientIdHash.mockResolvedValue(mockOrg);
      cryptoService.verifyHMAC.mockReturnValue(false);

      const timestamp = Date.now().toString();
      await request(app)
        .get('/test')
        .set({
          'X-Client-ID': 'test-client-id',
          'X-Timestamp': timestamp,
          'X-Signature': 'invalid-signature'
        })
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'HMAC validation failed: Invalid signature',
        expect.any(Object)
      );
    });
  });

  describe('validateJWT middleware', () => {
    beforeEach(() => {
      // Mock HMAC middleware to set org_id
      app.use((req, res, next) => {
        req.org_id = 'org-123';
        next();
      });
      app.use(validateJWT);
      app.get('/test', (req, res) => {
        res.json({ success: true, user: req.user });
      });
      app.use(errorHandler);
    });

    test('should pass with valid JWT token', async () => {
      const mockPayload = {
        user_id: 'user-123',
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900
      };

      const mockUser = {
        id: 'user-123',
        org_id: 'org-123',
        email: 'test@example.com',
        role: 'user',
        is_active: true
      };

      tokenService.verifyToken.mockReturnValue(mockPayload);
      userRepository.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid.jwt.token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toMatchObject({
        user_id: 'user-123',
        org_id: 'org-123',
        email: 'test@example.com',
        role: 'user',
        is_active: true
      });
    });

    test('should fail with missing Authorization header', async () => {
      await request(app)
        .get('/test')
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'JWT validation failed: Missing or invalid Authorization header',
        expect.any(Object)
      );
    });

    test('should fail with invalid token format', async () => {
      await request(app)
        .get('/test')
        .set('Authorization', 'Invalid token format')
        .expect(401);
    });

    test('should fail with non-access token', async () => {
      const mockPayload = {
        user_id: 'user-123',
        type: 'refresh', // Not an access token
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900
      };

      tokenService.verifyToken.mockReturnValue(mockPayload);

      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer refresh.token')
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'JWT validation failed: Invalid token type',
        expect.any(Object)
      );
    });

    test('should fail with inactive user', async () => {
      const mockPayload = {
        user_id: 'user-123',
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900
      };

      const mockUser = {
        id: 'user-123',
        org_id: 'org-123',
        email: 'test@example.com',
        role: 'user',
        is_active: false // Inactive user
      };

      tokenService.verifyToken.mockReturnValue(mockPayload);
      userRepository.findById.mockResolvedValue(mockUser);

      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid.jwt.token')
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'JWT validation failed: User account inactive',
        expect.any(Object)
      );
    });

    test('should handle expired token error', async () => {
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      
      tokenService.verifyToken.mockImplementation(() => {
        throw expiredError;
      });

      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer expired.jwt.token')
        .expect(401);

      expect(logger.warn).toHaveBeenCalledWith(
        'JWT validation failed: Token expired',
        expect.any(Object)
      );
    });
  });

  describe('roleAuth middleware', () => {
    beforeEach(() => {
      // Mock user in request
      app.use((req, res, next) => {
        req.user = {
          user_id: 'user-123',
          org_id: 'org-123',
          email: 'test@example.com',
          role: 'user',
          is_active: true
        };
        next();
      });
    });

    test('should allow access with correct role', async () => {
      app.use(roleAuth(['user', 'admin']));
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test')
        .expect(200);
    });

    test('should deny access with insufficient role', async () => {
      app.use(roleAuth(['admin', 'owner']));
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      await request(app)
        .get('/test')
        .expect(403);

      expect(logger.warn).toHaveBeenCalledWith(
        'Role authorization failed: Insufficient role',
        expect.any(Object)
      );
    });

    test('should handle ownership check', async () => {
      app.use(roleAuth(['user'], { requireOwnership: true, resourceParam: 'id' }));
      app.get('/test/:id', (req, res) => {
        res.json({ success: true });
      });
      app.use(errorHandler);

      // Should allow access to own resource
      await request(app)
        .get('/test/user-123')
        .expect(200);

      // Should deny access to other's resource
      await request(app)
        .get('/test/other-user-456')
        .expect(403);
    });

    test('should fail without authenticated user', async () => {
      const testApp = express();
      testApp.use(roleAuth(['user']));
      testApp.get('/test', (req, res) => {
        res.json({ success: true });
      });
      testApp.use(errorHandler);

      await request(testApp)
        .get('/test')
        .expect(401);
    });
  });

  describe('requestLogger middleware', () => {
    test('should log requests and responses', async () => {
      app.use(requestLogger);
      app.get('/test', (req, res) => {
        res.json({ message: 'test response' });
      });

      await request(app)
        .get('/test')
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'GET',
          path: '/test',
          correlationId: expect.any(String)
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Response sent',
        expect.objectContaining({
          method: 'GET',
          path: '/test',
          statusCode: 200,
          correlationId: expect.any(String)
        })
      );
    });

    test('should mask sensitive data in logs', async () => {
      app.use(requestLogger);
      app.post('/test', (req, res) => {
        res.json({ access_token: 'secret-token' });
      });

      await request(app)
        .post('/test')
        .send({ password: 'secret-password' })
        .set('Authorization', 'Bearer secret-token')
        .expect(200);

      // Check that sensitive data is masked
      const logCalls = logger.info.mock.calls;
      const requestLog = logCalls.find(call => call[0] === 'Incoming request')[1];
      const responseLog = logCalls.find(call => call[0] === 'Response sent')[1];

      expect(requestLog.body.password).toBe('***');
      expect(requestLog.authorization).toBe('Bearer ***');
      expect(responseLog.response.data.access_token).toBe('***');
    });
  });

  describe('errorHandler middleware', () => {
    test('should handle validation errors', async () => {
      app.get('/test', (req, res, next) => {
        const error = new Error('Validation failed');
        error.isJoi = true;
        error.details = [{
          path: ['email'],
          message: 'Email is required',
          context: { value: undefined }
        }];
        next(error);
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .expect(400);

      expect(response.body).toMatchObject({
        status: 'error',
        error_code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          violations: expect.arrayContaining([
            expect.objectContaining({
              field: 'email',
              message: 'Email is required'
            })
          ])
        }
      });
    });

    test('should handle JSON parsing errors', async () => {
      app.post('/test', (req, res, next) => {
        const error = new SyntaxError('Unexpected token');
        error.status = 400;
        error.body = {};
        next(error);
      });
      app.use(errorHandler);

      const response = await request(app)
        .post('/test')
        .expect(400);

      expect(response.body).toMatchObject({
        status: 'error',
        error_code: 'INVALID_JSON',
        message: 'Invalid JSON in request body'
      });
    });

    test('should handle unknown errors', async () => {
      app.get('/test', (req, res, next) => {
        next(new Error('Unknown error'));
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .expect(500);

      expect(response.body).toMatchObject({
        status: 'error',
        error_code: 'INTERNAL_SERVER_ERROR'
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled error',
        expect.any(Object)
      );
    });
  });
});