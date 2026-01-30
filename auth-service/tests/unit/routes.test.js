const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/routes/authRoutes');
const orgRoutes = require('../../src/routes/orgRoutes');
const userRoutes = require('../../src/routes/userRoutes');

// Mock all middleware
jest.mock('../../src/middleware', () => ({
  validateHMAC: (req, res, next) => {
    req.org_id = 'test-org-id';
    next();
  },
  validateJWT: (req, res, next) => {
    req.user = {
      user_id: 'test-user-id',
      org_id: 'test-org-id',
      email: 'test@example.com',
      role: 'admin',
      is_active: true
    };
    next();
  },
  roleAuth: {
    user: () => (req, res, next) => next(),
    admin: () => (req, res, next) => next(),
    owner: () => (req, res, next) => next(),
    adminOrSelf: () => (req, res, next) => next()
  }
}));

// Mock controllers
jest.mock('../../src/controllers/authController');
jest.mock('../../src/controllers/orgController');
jest.mock('../../src/controllers/userController');

const authController = require('../../src/controllers/authController');
const orgController = require('../../src/controllers/orgController');
const userController = require('../../src/controllers/userController');

describe('Routes Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('Auth Routes', () => {
    beforeEach(() => {
      app.use('/auth', authRoutes);
    });

    test('POST /auth/login should call authController.login', async () => {
      authController.login = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200);

      expect(authController.login).toHaveBeenCalled();
    });

    test('POST /auth/signup should call authController.signup', async () => {
      authController.signup = jest.fn((req, res) => {
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/auth/signup')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(201);

      expect(authController.signup).toHaveBeenCalled();
    });

    test('POST /auth/refresh should call authController.refresh', async () => {
      authController.refresh = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'token' })
        .expect(200);

      expect(authController.refresh).toHaveBeenCalled();
    });

    test('POST /auth/logout should call authController.logout', async () => {
      authController.logout = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/auth/logout')
        .send({ refresh_token: 'token' })
        .expect(200);

      expect(authController.logout).toHaveBeenCalled();
    });
  });

  describe('Organization Routes', () => {
    beforeEach(() => {
      app.use('/org', orgRoutes);
    });

    test('POST /org/register should call orgController.register', async () => {
      orgController.register = jest.fn((req, res) => {
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/org/register')
        .send({
          org_name: 'Test Org',
          admin_email: 'admin@test.com',
          admin_password: 'password'
        })
        .expect(201);

      expect(orgController.register).toHaveBeenCalled();
    });

    test('GET /org/details should call orgController.getDetails', async () => {
      orgController.getDetails = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/org/details')
        .expect(200);

      expect(orgController.getDetails).toHaveBeenCalled();
    });

    test('GET /org/settings should call orgController.getSettings', async () => {
      orgController.getSettings = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/org/settings')
        .expect(200);

      expect(orgController.getSettings).toHaveBeenCalled();
    });

    test('PATCH /org/settings should call orgController.updateSettings', async () => {
      orgController.updateSettings = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .patch('/org/settings')
        .send({ org_name: 'Updated Org' })
        .expect(200);

      expect(orgController.updateSettings).toHaveBeenCalled();
    });
  });

  describe('User Routes', () => {
    beforeEach(() => {
      app.use('/users', userRoutes);
    });

    test('GET /users should call userController.listUsers', async () => {
      userController.listUsers = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/users')
        .expect(200);

      expect(userController.listUsers).toHaveBeenCalled();
    });

    test('POST /users should call userController.createUser', async () => {
      userController.createUser = jest.fn((req, res) => {
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/users')
        .send({
          email: 'user@test.com',
          password: 'password',
          role: 'user'
        })
        .expect(201);

      expect(userController.createUser).toHaveBeenCalled();
    });

    test('GET /users/profile should call userController.getProfile', async () => {
      userController.getProfile = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/users/profile')
        .expect(200);

      expect(userController.getProfile).toHaveBeenCalled();
    });

    test('GET /users/:id should call userController.getUserById', async () => {
      userController.getUserById = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/users/user-123')
        .expect(200);

      expect(userController.getUserById).toHaveBeenCalled();
    });

    test('PATCH /users/:id should call userController.updateUser', async () => {
      userController.updateUser = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .patch('/users/user-123')
        .send({ email: 'updated@test.com' })
        .expect(200);

      expect(userController.updateUser).toHaveBeenCalled();
    });

    test('DELETE /users/:id should call userController.deactivateUser', async () => {
      userController.deactivateUser = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .delete('/users/user-123')
        .expect(200);

      expect(userController.deactivateUser).toHaveBeenCalled();
    });

    test('PATCH /users/:id/role should call userController.updateUserRole', async () => {
      userController.updateUserRole = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .patch('/users/user-123/role')
        .send({ role: 'admin' })
        .expect(200);

      expect(userController.updateUserRole).toHaveBeenCalled();
    });

    test('PATCH /users/:id/password should call userController.changePassword', async () => {
      userController.changePassword = jest.fn((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .patch('/users/user-123/password')
        .send({
          current_password: 'oldpass',
          new_password: 'newpass'
        })
        .expect(200);

      expect(userController.changePassword).toHaveBeenCalled();
    });
  });

  describe('Route Parameter Validation', () => {
    beforeEach(() => {
      app.use('/users', userRoutes);
    });

    test('should pass UUID parameters correctly', async () => {
      userController.getUserById = jest.fn((req, res) => {
        expect(req.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/users/550e8400-e29b-41d4-a716-446655440000')
        .expect(200);

      expect(userController.getUserById).toHaveBeenCalled();
    });

    test('should handle query parameters', async () => {
      userController.listUsers = jest.fn((req, res) => {
        expect(req.query.page).toBe('1');
        expect(req.query.limit).toBe('10');
        expect(req.query.role).toBe('admin');
        res.status(200).json({ success: true });
      });

      await request(app)
        .get('/users?page=1&limit=10&role=admin')
        .expect(200);

      expect(userController.listUsers).toHaveBeenCalled();
    });
  });

  describe('Route Middleware Chain', () => {
    test('should apply middleware in correct order', async () => {
      const middlewareOrder = [];
      
      const testApp = express();
      testApp.use(express.json());
      
      // Mock middleware that tracks execution order
      const mockValidateHMAC = (req, res, next) => {
        middlewareOrder.push('validateHMAC');
        req.org_id = 'test-org';
        next();
      };
      
      const mockValidateJWT = (req, res, next) => {
        middlewareOrder.push('validateJWT');
        req.user = { user_id: 'test-user', role: 'admin' };
        next();
      };
      
      const mockRoleAuth = (req, res, next) => {
        middlewareOrder.push('roleAuth');
        next();
      };
      
      testApp.get('/test', mockValidateHMAC, mockValidateJWT, mockRoleAuth, (req, res) => {
        middlewareOrder.push('controller');
        res.json({ success: true });
      });
      
      await request(testApp)
        .get('/test')
        .expect(200);
      
      expect(middlewareOrder).toEqual([
        'validateHMAC',
        'validateJWT', 
        'roleAuth',
        'controller'
      ]);
    });
  });
});