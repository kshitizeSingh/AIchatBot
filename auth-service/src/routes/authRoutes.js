const express = require('express');
const authController = require('../controllers/authController');
const { validateHMAC, validateJWT } = require('../middleware');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *           example: user@example.com
 *         password:
 *           type: string
 *           minLength: 12
 *           description: User's password (minimum 12 characters)
 *           example: SecurePassword123!
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         access_token:
 *           type: string
 *           description: JWT access token
 *         refresh_token:
 *           type: string
 *           description: JWT refresh token
 *         expires_in:
 *           type: integer
 *           description: Access token expiration time in seconds
 *           example: 900
 *         token_type:
 *           type: string
 *           example: Bearer
 *         user:
 *           type: object
 *           properties:
 *             user_id:
 *               type: string
 *               format: uuid
 *             email:
 *               type: string
 *             role:
 *               type: string
 *               enum: [owner, admin, user]
 *             org_id:
 *               type: string
 *               format: uuid
 *     
 *     SignupRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         password:
 *           type: string
 *           minLength: 12
 *           description: User's password (minimum 12 characters)
 *     
 *     RefreshRequest:
 *       type: object
 *       required:
 *         - refresh_token
 *       properties:
 *         refresh_token:
 *           type: string
 *           description: Valid refresh token
 *     
 *     LogoutRequest:
 *       type: object
 *       required:
 *         - refresh_token
 *       properties:
 *         refresh_token:
 *           type: string
 *           description: Refresh token to revoke
 */

/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     description: Authenticate user with email and password, returns access and refresh tokens
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization client ID
 *         example: pk_abc123...
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *         description: Unix timestamp in milliseconds
 *         example: 1640995200000
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/LoginResponse'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', validateHMAC, authController.login);

/**
 * @swagger
 * /v1/auth/signup:
 *   post:
 *     summary: User registration
 *     tags: [Authentication]
 *     description: Register a new user in the organization
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization client ID
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *         description: Unix timestamp in milliseconds
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     org_id:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication failed
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
 *         description: Organization client ID
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *         description: Unix timestamp in milliseconds
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token:
 *                       type: string
 *                     refresh_token:
 *                       type: string
 *                     expires_in:
 *                       type: integer
 *                     token_type:
 *                       type: string
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
 *     description: Logout user and revoke refresh token
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Client-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization client ID
 *       - in: header
 *         name: X-Timestamp
 *         required: true
 *         schema:
 *           type: integer
 *         description: Unix timestamp in milliseconds
 *       - in: header
 *         name: X-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogoutRequest'
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         description: Authentication failed
 */
router.post('/logout', [validateHMAC, validateJWT], authController.logout);

module.exports = router;