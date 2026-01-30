const express = require('express');
const orgController = require('../controllers/orgController');
const { validateHMAC, validateJWT, roleAuth } = require('../middleware');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     OrgRegistrationRequest:
 *       type: object
 *       required:
 *         - org_name
 *         - admin_email
 *         - admin_password
 *       properties:
 *         org_name:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *           description: Organization name
 *           example: Acme Corporation
 *         admin_email:
 *           type: string
 *           format: email
 *           description: Admin user email
 *           example: admin@acme.com
 *         admin_password:
 *           type: string
 *           minLength: 12
 *           description: Admin user password
 *           example: SecureAdminPass123!
 *     
 *     OrgRegistrationResponse:
 *       type: object
 *       properties:
 *         org_id:
 *           type: string
 *           format: uuid
 *           description: Organization ID
 *         org_name:
 *           type: string
 *           description: Organization name
 *         client_id:
 *           type: string
 *           description: HMAC client ID (save this)
 *         client_secret:
 *           type: string
 *           description: HMAC client secret (save this - cannot be retrieved later)
 *         admin_user:
 *           type: object
 *           properties:
 *             user_id:
 *               type: string
 *               format: uuid
 *             email:
 *               type: string
 *             role:
 *               type: string
 *               enum: [owner]
 *         warning:
 *           type: string
 *           description: Important warning about client_secret
 *     
 *     OrgDetailsResponse:
 *       type: object
 *       properties:
 *         org_id:
 *           type: string
 *           format: uuid
 *         org_name:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /v1/org/register:
 *   post:
 *     summary: Register new organization
 *     tags: [Organization]
 *     description: |
 *       Register a new organization with admin user. This is a public endpoint that doesn't require authentication.
 *       
 *       **Important:** Save the `client_secret` immediately as it cannot be retrieved later!
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrgRegistrationRequest'
 *     responses:
 *       201:
 *         description: Organization registered successfully
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
 *                   $ref: '#/components/schemas/OrgRegistrationResponse'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 */
router.post('/register', orgController.register);

/**
 * @swagger
 * /v1/org/details:
 *   get:
 *     summary: Get organization details
 *     tags: [Organization]
 *     description: Retrieve details about the current organization
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
 *     responses:
 *       200:
 *         description: Organization details retrieved successfully
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
 *                   $ref: '#/components/schemas/OrgDetailsResponse'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication failed
 *       403:
 *         description: Insufficient permissions
 */
router.get('/details', [validateHMAC, validateJWT, roleAuth.user()], orgController.getDetails);

/**
 * @swagger
 * /v1/org/settings:
 *   get:
 *     summary: Get organization settings
 *     tags: [Organization]
 *     description: Retrieve organization settings (admin only)
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
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *       403:
 *         description: Admin access required
 *   
 *   patch:
 *     summary: Update organization settings
 *     tags: [Organization]
 *     description: Update organization settings (admin only)
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
 *               org_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 255
 *               settings:
 *                 type: object
 *                 description: Organization-specific settings
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       403:
 *         description: Admin access required
 */
router.get('/settings', [validateHMAC, validateJWT, roleAuth.admin()], orgController.getSettings);
router.patch('/settings', [validateHMAC, validateJWT, roleAuth.admin()], orgController.updateSettings);

module.exports = router;