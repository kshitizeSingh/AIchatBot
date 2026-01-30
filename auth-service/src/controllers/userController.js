const userService = require('../services/userService');
const { successResponse, errorResponse } = require('../utils/responses');
const { validateUserCreation, validateUserUpdate, validateRoleUpdate, validatePasswordChange } = require('../validators/userValidator');
const logger = require('../utils/logger');
const { AUDIT_ACTIONS } = require('../utils/constants');

/**
 * User Management Controller
 * Handles all user-related endpoints including CRUD operations, profile management, and role assignments
 */
class UserController {
  /**
   * POST /v1/users
   * Create a new user in the organization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createUser(req, res, next) {
    try {
      logger.debug('Create user endpoint called', { 
        orgId: req.user.org_id,
        createdBy: req.user.user_id,
        targetEmail: req.body.email 
      });

      // Check permission - only admin and owner can create users
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized user creation attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can create users'
          )
        );
      }

      // Validate input
      const { error, value } = validateUserCreation(req.body);
      if (error) {
        logger.warn('User creation validation failed', { 
          error: error.details[0].message,
          createdBy: req.user.user_id 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Additional role validation - admin cannot create owner
      if (req.user.role === 'admin' && value.role === 'owner') {
        logger.warn('Admin attempted to create owner user', {
          userId: req.user.user_id,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Admin cannot create owner users'
          )
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        createdBy: req.user.user_id
      };

      // Call user service
      const result = await userService.createUser(
        value.email,
        value.password,
        value.role,
        req.user.org_id,
        clientInfo
      );

      logger.info('User created successfully', { 
        newUserId: result.user_id,
        email: result.email,
        role: result.role,
        createdBy: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(201).json(
        successResponse(result, 'User created successfully')
      );
    } catch (error) {
      logger.error('Create user endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/users
   * Get list of users in the organization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async listUsers(req, res, next) {
    try {
      logger.debug('List users endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id 
      });

      // Check permission - only admin and owner can list users
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized users list access attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can view users list'
          )
        );
      }

      // Parse query parameters for pagination and filtering
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 per page
      const search = req.query.search || '';
      const role = req.query.role || '';
      const status = req.query.status || 'active'; // active, inactive, all
      const sortBy = req.query.sortBy || 'created_at';
      const sortOrder = req.query.sortOrder || 'desc';

      // Call user service
      const result = await userService.listOrgUsers(req.user.org_id, {
        page,
        limit,
        search,
        role,
        status,
        sortBy,
        sortOrder
      });

      logger.info('Users list retrieved', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        totalUsers: result.total,
        page,
        limit 
      });

      return res.status(200).json(
        successResponse(result, 'Users retrieved successfully')
      );
    } catch (error) {
      logger.error('List users endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/users/:userId
   * Get specific user details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getUserById(req, res, next) {
    try {
      const targetUserId = req.params.userId;
      
      logger.debug('Get user by ID endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId 
      });

      // Check permission - users can view their own profile, admin/owner can view any
      const canViewUser = req.user.user_id === targetUserId || 
                         ['owner', 'admin'].includes(req.user.role);
      
      if (!canViewUser) {
        logger.warn('Unauthorized user profile access attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          targetUserId,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'You can only view your own profile or admin/owner can view any profile'
          )
        );
      }

      // Call user service
      const user = await userService.getUserById(targetUserId, req.user.org_id);

      if (!user) {
        return res.status(404).json(
          errorResponse('USER_NOT_FOUND', 'User not found')
        );
      }

      logger.info('User details retrieved', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId 
      });

      return res.status(200).json(
        successResponse(user, 'User details retrieved successfully')
      );
    } catch (error) {
      logger.error('Get user by ID endpoint error:', error);
      next(error);
    }
  }

  /**
   * PUT /v1/users/:userId
   * Update user details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateUser(req, res, next) {
    try {
      const targetUserId = req.params.userId;
      
      logger.debug('Update user endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId 
      });

      // Check permission - users can update their own profile, admin/owner can update any
      const canUpdateUser = req.user.user_id === targetUserId || 
                           ['owner', 'admin'].includes(req.user.role);
      
      if (!canUpdateUser) {
        logger.warn('Unauthorized user update attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          targetUserId,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'You can only update your own profile or admin/owner can update any profile'
          )
        );
      }

      // Validate input
      const { error, value } = validateUserUpdate(req.body);
      if (error) {
        logger.warn('User update validation failed', { 
          error: error.details[0].message,
          userId: req.user.user_id,
          targetUserId 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        updatedBy: req.user.user_id
      };

      // Call user service
      const result = await userService.updateUser(
        targetUserId,
        value,
        req.user.org_id,
        clientInfo
      );

      logger.info('User updated successfully', { 
        targetUserId,
        updatedBy: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse(result, 'User updated successfully')
      );
    } catch (error) {
      logger.error('Update user endpoint error:', error);
      next(error);
    }
  }

  /**
   * PATCH /v1/users/:userId/role
   * Update user role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateUserRole(req, res, next) {
    try {
      const targetUserId = req.params.userId;
      
      logger.debug('Update user role endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId,
        newRole: req.body.role 
      });

      // Check permission - only owner can change roles
      if (req.user.role !== 'owner') {
        logger.warn('Unauthorized role update attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          targetUserId,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only organization owner can change user roles'
          )
        );
      }

      // Prevent self-role change
      if (targetUserId === req.user.user_id) {
        return res.status(400).json(
          errorResponse(
            'INVALID_OPERATION', 
            'Cannot change your own role'
          )
        );
      }

      // Validate input
      const { error, value } = validateRoleUpdate(req.body);
      if (error) {
        logger.warn('Role update validation failed', { 
          error: error.details[0].message,
          userId: req.user.user_id,
          targetUserId 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        updatedBy: req.user.user_id
      };

      // Call user service
      const result = await userService.updateUserRole(
        targetUserId,
        value.role,
        req.user.org_id,
        clientInfo
      );

      logger.info('User role updated successfully', { 
        targetUserId,
        newRole: value.role,
        updatedBy: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse(result, 'User role updated successfully')
      );
    } catch (error) {
      logger.error('Update user role endpoint error:', error);
      next(error);
    }
  }

  /**
   * PATCH /v1/users/:userId/status
   * Update user status (activate/deactivate)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateUserStatus(req, res, next) {
    try {
      const targetUserId = req.params.userId;
      const { is_active } = req.body;
      
      logger.debug('Update user status endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId,
        newStatus: is_active 
      });

      // Check permission - only admin and owner can change user status
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized status update attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          targetUserId,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can change user status'
          )
        );
      }

      // Prevent self-deactivation
      if (targetUserId === req.user.user_id && !is_active) {
        return res.status(400).json(
          errorResponse(
            'INVALID_OPERATION', 
            'Cannot deactivate your own account'
          )
        );
      }

      // Validate input
      if (typeof is_active !== 'boolean') {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'is_active must be a boolean value')
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        updatedBy: req.user.user_id
      };

      // Call user service
      const result = await userService.updateUserStatus(
        targetUserId,
        is_active,
        req.user.org_id,
        clientInfo
      );

      logger.info('User status updated successfully', { 
        targetUserId,
        newStatus: is_active,
        updatedBy: req.user.user_id,
        orgId: req.user.org_id 
      });

      const statusText = is_active ? 'activated' : 'deactivated';
      return res.status(200).json(
        successResponse(result, `User ${statusText} successfully`)
      );
    } catch (error) {
      logger.error('Update user status endpoint error:', error);
      next(error);
    }
  }

  /**
   * DELETE /v1/users/:userId
   * Delete user from organization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteUser(req, res, next) {
    try {
      const targetUserId = req.params.userId;
      
      logger.debug('Delete user endpoint called', { 
        orgId: req.user.org_id,
        userId: req.user.user_id,
        targetUserId 
      });

      // Check permission - only owner can delete users
      if (req.user.role !== 'owner') {
        logger.warn('Unauthorized user deletion attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          targetUserId,
          orgId: req.user.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only organization owner can delete users'
          )
        );
      }

      // Prevent self-deletion
      if (targetUserId === req.user.user_id) {
        return res.status(400).json(
          errorResponse(
            'INVALID_OPERATION', 
            'Cannot delete your own account'
          )
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        deletedBy: req.user.user_id
      };

      // Call user service
      await userService.deleteUser(
        targetUserId,
        req.user.org_id,
        clientInfo
      );

      logger.info('User deleted successfully', { 
        targetUserId,
        deletedBy: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse({}, 'User deleted successfully')
      );
    } catch (error) {
      logger.error('Delete user endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/user/profile
   * Get current user's profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getProfile(req, res, next) {
    try {
      logger.debug('Get user profile endpoint called', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      // Call user service
      const user = await userService.getUserById(req.user.user_id, req.user.org_id);

      if (!user) {
        return res.status(404).json(
          errorResponse('USER_NOT_FOUND', 'User profile not found')
        );
      }

      logger.info('User profile retrieved', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse(user, 'User profile retrieved successfully')
      );
    } catch (error) {
      logger.error('Get user profile endpoint error:', error);
      next(error);
    }
  }

  /**
   * PUT /v1/user/profile
   * Update current user's profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateProfile(req, res, next) {
    try {
      logger.debug('Update user profile endpoint called', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      // Validate input
      const { error, value } = validateUserUpdate(req.body);
      if (error) {
        logger.warn('Profile update validation failed', { 
          error: error.details[0].message,
          userId: req.user.user_id 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        updatedBy: req.user.user_id
      };

      // Call user service
      const result = await userService.updateUser(
        req.user.user_id,
        value,
        req.user.org_id,
        clientInfo
      );

      logger.info('User profile updated successfully', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse(result, 'Profile updated successfully')
      );
    } catch (error) {
      logger.error('Update user profile endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/user/change-password
   * Change current user's password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async changePassword(req, res, next) {
    try {
      logger.debug('Change password endpoint called', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      // Validate input
      const { error, value } = validatePasswordChange(req.body);
      if (error) {
        logger.warn('Password change validation failed', { 
          error: error.details[0].message,
          userId: req.user.user_id 
        });
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message, {
            field: error.details[0].path[0]
          })
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Call user service
      await userService.changePassword(
        req.user.user_id,
        value.current_password,
        value.new_password,
        req.user.org_id,
        clientInfo
      );

      logger.info('Password changed successfully', { 
        userId: req.user.user_id,
        orgId: req.user.org_id 
      });

      return res.status(200).json(
        successResponse({}, 'Password changed successfully')
      );
    } catch (error) {
      logger.error('Change password endpoint error:', error);
      next(error);
    }
  }
}

module.exports = new UserController();