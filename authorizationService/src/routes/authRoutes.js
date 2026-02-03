const express = require('express');
const crypto = require('crypto');
const authController = require('../controllers/authController');
const validateHMAC = require('../middleware/validateHMAC');
const validateJWT = require('../middleware/validateJWT');
const orgRepository = require('../persistence/orgRepository');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     description: Authenticate user and return access + refresh tokens
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Authentication failed
 *       400:
 *         description: Validation error
 */
router.post('/login', validateHMAC, authController.login);

/**
 * @swagger
 * /v1/auth/signup:
 *   post:
 *     summary: User signup
 *     tags: [Authentication]
 *     description: Register a new user
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 12
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
router.post('/signup', validateHMAC, authController.signup);

/**
 * @swagger
 * /v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     description: Get new access token using refresh token
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validateHMAC, authController.refresh);

/**
 * @swagger
 * /v1/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', [validateHMAC, require('../middleware/validateJWT')], authController.logout);

/**
 * @swagger
 * /v1/auth/validate-jwt:
 *   post:
 *     summary: Validate JWT token (for other services)
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       example: "uuid"
 *                     org_id:
 *                       type: string
 *                       example: "uuid"
 *                     role:
 *                       type: string
 *                       example: "admin"
 *       401:
 *         description: Invalid or expired token
 */
router.post('/validate-jwt', validateJWT, (req, res) => {
  res.json({
    valid: true,
    user: {
      user_id: req.user.user_id,
      org_id: req.user.org_id,
      role: req.user.role
    }
  });
});

/**
 * @swagger
 * /v1/auth/validate-hmac:
 *   post:
 *     summary: Validate HMAC signature (for other services)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - client_id
 *               - signature
 *               - timestamp
 *               - payload
 *             properties:
 *               client_id:
 *                 type: string
 *                 example: "pk_abc123..."
 *               signature:
 *                 type: string
 *                 example: "a1b2c3..."
 *               timestamp:
 *                 type: string
 *                 example: "1738459200000"
 *               payload:
 *                 type: object
 *                 example: {"method": "POST", "path": "/api/query"}
 *     responses:
 *       200:
 *         description: HMAC signature is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 org_id:
 *                   type: string
 *                   example: "uuid"
 *                 org_name:
 *                   type: string
 *                   example: "ACME Corp"
 *       401:
 *         description: Invalid HMAC signature
 */
router.post('/validate-hmac', async (req, res) => {
  try {
    const { client_id, signature, timestamp, payload } = req.body;

    if (!client_id || !signature || !timestamp || !payload) {
      return res.status(400).json({
        valid: false,
        error: 'Missing required fields'
      });
    }

    // Validate HMAC signature
    const clientIdHash = crypto.createHash('sha256').update(client_id).digest('hex');
    const org = await orgRepository.findByClientIdHash(clientIdHash);

    if (!org) {
      return res.status(401).json({
        valid: false,
        error: 'Invalid client ID'
      });
    }

    // Check timestamp freshness (5-minute window)
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 300000) {
      return res.status(401).json({
        valid: false,
        error: 'Request timestamp expired'
      });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', org.client_secret_hash)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({
        valid: false,
        error: 'Invalid signature'
      });
    }

    res.json({
      valid: true,
      org_id: org.id,
      org_name: org.name
    });
  } catch (error) {
    logger.error('HMAC validation error', { error: error.message });
    res.status(500).json({
      valid: false,
      error: 'Internal server error'
    });
  }
});
