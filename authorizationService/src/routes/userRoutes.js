const express = require('express');
const userController = require('../controllers/userController');
const validateHMAC = require('../middleware/validateHMAC');
const validateJWT = require('../middleware/validateJWT');

const router = express.Router();

/**
 * @swagger
 * /v1/users:
 *   post:
 *     summary: Create user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
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
 *               role:
 *                 type: string
 *                 enum: [owner, admin, user]
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient permission
 */
router.post('/', [validateHMAC, validateJWT], userController.createUser);

/**
 * @swagger
 * /v1/users:
 *   get:
 *     summary: List organization users
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
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
 *         description: Users retrieved successfully
 *       403:
 *         description: Insufficient permission
 */
router.get('/', [validateHMAC, validateJWT], userController.listUsers);

/**
 * @swagger
 * /v1/users/{id}/role:
 *   patch:
 *     summary: Update user role
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *       - HMACAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *               role:
 *                 type: string
 *                 enum: [owner, admin, user]
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Only owner can change roles
 *       404:
 *         description: User not found
 */
router.patch('/:id/role', [validateHMAC, validateJWT], userController.updateUserRole);

/**
 * @swagger
 * /v1/user:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
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
 *         description: User profile retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', [validateHMAC, validateJWT], userController.getProfile);

module.exports = router;
