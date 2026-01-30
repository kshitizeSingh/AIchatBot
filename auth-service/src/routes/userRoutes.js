const express = require('express');
const userController = require('../controllers/userController');
const { validateHMAC, validateJWT, roleAuth } = require('../middleware');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserCreationRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - role
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *           example: user@example.com
 *         password:
 *           type: string
 *           minLength: 12
 *           description: User's password
 *           example: SecurePassword123!
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           description: User role (owner can only be set during org creation)
 *           example: user
 *     
 *     UserResponse:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [owner, admin, user]
 *         is_active:
 *           type: boolean
 *         last_login_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *     
 *     UserListResponse:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/UserResponse'
 *     
 *     RoleUpdateRequest:
 *       type: object
 *       required:
 *         - role
 *       properties:
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           description: New role for the user
 */

/**
 * @swagger
 * /v1/users:
 *   get:
 *     summary: List organization users
 *     tags: [User Management]
 *     description: Get list of all users in the organization (admin only)
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, user]
 *         description: Filter by role
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
 *                   $ref: '#/components/schemas/UserListResponse'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Admin access required
 *   
 *   post:
 *     summary: Create new user
 *     tags: [User Management]
 *     description: Create a new user in the organization (admin only)
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
 *             $ref: '#/components/schemas/UserCreationRequest'
 *     responses:
 *       201:
 *         description: User created successfully
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
 *                   $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: Validation error
 *       403:
 *         description: Admin access required
 */
router.get('/', [validateHMAC, validateJWT, roleAuth.admin()], userController.listUsers);
router.post('/', [validateHMAC, validateJWT, roleAuth.admin()], userController.createUser);

/**
 * @swagger
 * /v1/users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [User Management]
 *     description: Get the current authenticated user's profile
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
 *         description: Profile retrieved successfully
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
 *                   $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Authentication required
 */
router.get('/profile', [validateHMAC, validateJWT], userController.getProfile);

/**
 * @swagger
 * /v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [User Management]
 *     description: Get user details by ID (admin only or own profile)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
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
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 data:
 *                   $ref: '#/components/schemas/UserResponse'
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *   
 *   patch:
 *     summary: Update user
 *     tags: [User Management]
 *     description: Update user details (admin only or own profile for limited fields)
 *     security:
 *       - BearerAuth: []
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
 *               email:
 *                 type: string
 *                 format: email
 *               is_active:
 *                 type: boolean
 *                 description: Admin only
 *     responses:
 *       200:
 *         description: User updated successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *   
 *   delete:
 *     summary: Deactivate user
 *     tags: [User Management]
 *     description: Deactivate user account (admin only)
 *     security:
 *       - BearerAuth: []
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
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.get('/:id', [validateHMAC, validateJWT, roleAuth.adminOrSelf('id')], userController.getUserById);
router.patch('/:id', [validateHMAC, validateJWT, roleAuth.adminOrSelf('id')], userController.updateUser);
router.delete('/:id', [validateHMAC, validateJWT, roleAuth.admin()], userController.deactivateUser);

/**
 * @swagger
 * /v1/users/{id}/role:
 *   patch:
 *     summary: Update user role
 *     tags: [User Management]
 *     description: Update user role (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
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
 *             $ref: '#/components/schemas/RoleUpdateRequest'
 *     responses:
 *       200:
 *         description: Role updated successfully
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
 *                   $ref: '#/components/schemas/UserResponse'
 *       403:
 *         description: Owner access required
 *       404:
 *         description: User not found
 */
router.patch('/:id/role', [validateHMAC, validateJWT, roleAuth.owner()], userController.updateUserRole);

/**
 * @swagger
 * /v1/users/{id}/password:
 *   patch:
 *     summary: Change user password
 *     tags: [User Management]
 *     description: Change user password (own password or admin)
 *     security:
 *       - BearerAuth: []
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
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *                 description: Current password (required for own password change)
 *               new_password:
 *                 type: string
 *                 minLength: 12
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.patch('/:id/password', [validateHMAC, validateJWT, roleAuth.adminOrSelf('id')], userController.changePassword);

module.exports = router;