const express = require('express');
const orgController = require('../controllers/orgController');
const validateHMAC = require('../middleware/validateHMAC');

const router = express.Router();

/**
 * @swagger
 * /v1/org/register:
 *   post:
 *     summary: Register organization
 *     tags: [Organization]
 *     description: Register a new organization (public endpoint)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               org_name:
 *                 type: string
 *                 minLength: 3
 *               admin_email:
 *                 type: string
 *                 format: email
 *               admin_password:
 *                 type: string
 *                 minLength: 12
 *     responses:
 *       201:
 *         description: Organization registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/register', orgController.register);

/**
 * @swagger
 * /v1/org/details:
 *   get:
 *     summary: Get organization details
 *     tags: [Organization]
 *     security:
 *       - HMACAuth: []
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
 *         description: Organization details retrieved
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: Organization not found
 */
router.get('/details', validateHMAC, orgController.getDetails);

module.exports = router;
