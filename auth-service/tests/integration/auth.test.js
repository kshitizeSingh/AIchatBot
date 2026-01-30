const request = require('supertest');
const app = require('../../src/app');
const crypto = require('crypto');

// Test data
const testOrg = {
  org_name: 'Test Organization',
  admin_email: 'admin@test.com',
  admin_password: 'SecureTestPass123!'
};

let orgCredentials = {};
let userTokens = {};

// Helper function to generate HMAC signature
function generateHMAC(clientSecret, payload) {
  return crypto
    .createHmac('sha256', clientSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

// Helper function to create HMAC headers
function createHMACHeaders(clientId, clientSecret, method, path, body = {}) {
  const timestamp = Date.now().toString();
  const payload = {
    method,
    path,
    timestamp,
    body
  };
  
  const signature = generateHMAC(clientSecret, payload);
  
  return {
    'X-Client-ID': clientId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}

describe('Auth Service Integration Tests', () => {
  
  describe('Organization Registration', () => {
    test('should register new organization successfully', async () => {
      const response = await request(app)
        .post('/v1/org/register')
        .send(testOrg)
        .expect(201);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('org_id');
      expect(response.body.data).toHaveProperty('client_id');
      expect(response.body.data).toHaveProperty('client_secret');
      expect(response.body.data).toHaveProperty('admin_user');
      
      // Store credentials for subsequent tests
      orgCredentials = {
        orgId: response.body.data.org_id,
        clientId: response.body.data.client_id,
        clientSecret: response.body.data.client_secret,
        adminUserId: response.body.data.admin_user.user_id
      };
    });

    test('should fail with invalid organization data', async () => {
      const invalidOrg = {
        org_name: 'A', // Too short
        admin_email: 'invalid-email',
        admin_password: '123' // Too weak
      };

      await request(app)
        .post('/v1/org/register')
        .send(invalidOrg)
        .expect(400);
    });

    test('should fail with duplicate organization name', async () => {
      await request(app)
        .post('/v1/org/register')
        .send(testOrg)
        .expect(400);
    });
  });

  describe('Authentication', () => {
    test('should login admin user successfully', async () => {
      const loginData = {
        email: testOrg.admin_email,
        password: testOrg.admin_password
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/login',
        loginData
      );

      const response = await request(app)
        .post('/v1/auth/login')
        .set(headers)
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('role', 'owner');
      
      // Store tokens for subsequent tests
      userTokens = {
        accessToken: response.body.data.access_token,
        refreshToken: response.body.data.refresh_token
      };
    });

    test('should fail login with invalid credentials', async () => {
      const loginData = {
        email: testOrg.admin_email,
        password: 'wrongpassword'
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/login',
        loginData
      );

      await request(app)
        .post('/v1/auth/login')
        .set(headers)
        .send(loginData)
        .expect(401);
    });

    test('should fail login without HMAC headers', async () => {
      const loginData = {
        email: testOrg.admin_email,
        password: testOrg.admin_password
      };

      await request(app)
        .post('/v1/auth/login')
        .send(loginData)
        .expect(401);
    });

    test('should fail login with invalid HMAC signature', async () => {
      const loginData = {
        email: testOrg.admin_email,
        password: testOrg.admin_password
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        'wrong-secret',
        'POST',
        '/v1/auth/login',
        loginData
      );

      await request(app)
        .post('/v1/auth/login')
        .set(headers)
        .send(loginData)
        .expect(401);
    });
  });

  describe('User Registration', () => {
    test('should register new user successfully', async () => {
      const userData = {
        email: 'user@test.com',
        password: 'SecureUserPass123!'
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/signup',
        userData
      );

      const response = await request(app)
        .post('/v1/auth/signup')
        .set(headers)
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('user_id');
      expect(response.body.data).toHaveProperty('email', userData.email);
      expect(response.body.data).toHaveProperty('role', 'user');
    });

    test('should fail with duplicate email', async () => {
      const userData = {
        email: 'user@test.com', // Same as previous test
        password: 'SecureUserPass123!'
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/signup',
        userData
      );

      await request(app)
        .post('/v1/auth/signup')
        .set(headers)
        .send(userData)
        .expect(400);
    });
  });

  describe('Token Refresh', () => {
    test('should refresh access token successfully', async () => {
      const refreshData = {
        refresh_token: userTokens.refreshToken
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/refresh',
        refreshData
      );

      const response = await request(app)
        .post('/v1/auth/refresh')
        .set(headers)
        .send(refreshData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      
      // Update tokens
      userTokens.accessToken = response.body.data.access_token;
      userTokens.refreshToken = response.body.data.refresh_token;
    });

    test('should fail with invalid refresh token', async () => {
      const refreshData = {
        refresh_token: 'invalid.refresh.token'
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/refresh',
        refreshData
      );

      await request(app)
        .post('/v1/auth/refresh')
        .set(headers)
        .send(refreshData)
        .expect(401);
    });
  });

  describe('Protected Endpoints', () => {
    test('should access user profile with valid token', async () => {
      const headers = {
        ...createHMACHeaders(
          orgCredentials.clientId,
          orgCredentials.clientSecret,
          'GET',
          '/v1/users/profile'
        ),
        'Authorization': `Bearer ${userTokens.accessToken}`
      };

      const response = await request(app)
        .get('/v1/users/profile')
        .set(headers)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('user_id');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('role');
    });

    test('should fail without JWT token', async () => {
      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'GET',
        '/v1/users/profile'
      );

      await request(app)
        .get('/v1/users/profile')
        .set(headers)
        .expect(401);
    });

    test('should fail with invalid JWT token', async () => {
      const headers = {
        ...createHMACHeaders(
          orgCredentials.clientId,
          orgCredentials.clientSecret,
          'GET',
          '/v1/users/profile'
        ),
        'Authorization': 'Bearer invalid.jwt.token'
      };

      await request(app)
        .get('/v1/users/profile')
        .set(headers)
        .expect(401);
    });
  });

  describe('User Logout', () => {
    test('should logout successfully', async () => {
      const logoutData = {
        refresh_token: userTokens.refreshToken
      };

      const headers = {
        ...createHMACHeaders(
          orgCredentials.clientId,
          orgCredentials.clientSecret,
          'POST',
          '/v1/auth/logout',
          logoutData
        ),
        'Authorization': `Bearer ${userTokens.accessToken}`
      };

      const response = await request(app)
        .post('/v1/auth/logout')
        .set(headers)
        .send(logoutData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
    });

    test('should fail to use revoked refresh token', async () => {
      const refreshData = {
        refresh_token: userTokens.refreshToken // This token was revoked in logout
      };

      const headers = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/refresh',
        refreshData
      );

      await request(app)
        .post('/v1/auth/refresh')
        .set(headers)
        .send(refreshData)
        .expect(401);
    });
  });

  describe('Organization Details', () => {
    test('should get organization details', async () => {
      // First login again to get fresh tokens
      const loginData = {
        email: testOrg.admin_email,
        password: testOrg.admin_password
      };

      const loginHeaders = createHMACHeaders(
        orgCredentials.clientId,
        orgCredentials.clientSecret,
        'POST',
        '/v1/auth/login',
        loginData
      );

      const loginResponse = await request(app)
        .post('/v1/auth/login')
        .set(loginHeaders)
        .send(loginData)
        .expect(200);

      const accessToken = loginResponse.body.data.access_token;

      // Now get org details
      const headers = {
        ...createHMACHeaders(
          orgCredentials.clientId,
          orgCredentials.clientSecret,
          'GET',
          '/v1/org/details'
        ),
        'Authorization': `Bearer ${accessToken}`
      };

      const response = await request(app)
        .get('/v1/org/details')
        .set(headers)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('org_id', orgCredentials.orgId);
      expect(response.body.data).toHaveProperty('org_name', testOrg.org_name);
      expect(response.body.data).toHaveProperty('is_active', true);
    });
  });
});

// Cleanup after tests
afterAll(async () => {
  // In a real scenario, you might want to clean up test data
  // For now, we'll just close any open connections
  if (global.gc) {
    global.gc();
  }
});