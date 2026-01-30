const userRepository = require('../persistence/userRepository');
const auditRepository = require('../persistence/auditRepository');
const cryptoService = require('./cryptoService');
const tokenService = require('./tokenService');
const { ValidationError, AuthorizationError, NotFoundError, BusinessLogicError } = require('../utils/errors');
const { USER_ROLES, AUDIT_ACTIONS, AUDIT_STATUS } = require('../utils/constants');
const { isValidEmail, cleanObject } = require('../utils/helpers');
const logger = require('../utils/logger');

class UserService {
  /**
   * Create new user (admin only)
   */
  async createUser(email, password, role, orgId, createdBy) {
    try {
      logger.audit('User creation started', { email, role, orgId, createdBy });
      
      // Validate input
      if (!isValidEmail(email)) {
        throw new ValidationError('INVALID_EMAIL', 'Invalid email format');
      }

      if (!Object.values(USER_ROLES).includes(role)) {
        throw new ValidationError('INVALID_ROLE', `Role must be one of: ${Object.values(USER_ROLES).join(', ')}`);
      }

      // Check if user already exists
      const existingUser = await userRepository.findByEmailAndOrg(email, orgId);
      if (existingUser) {
        throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
      }

      // Validate password
      cryptoService.validatePassword(password);

      // Hash password
      const passwordHash = await cryptoService.hashPassword(password);

      // Create user
      const userData = {
        org_id: orgId,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role
      };

      const user = await userRepository.create(userData);

      // Log user creation
      await auditRepository.log({
        org_id: orgId,
        user_id: createdBy,
        action: AUDIT_ACTIONS.USER_CREATED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: user.id,
        details: {
          created_user_email: user.email,
          created_user_role: user.role
        }
      });

      logger.audit('User created successfully', { userId: user.id, email, role });

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id,
        is_active: user.is_active,
        created_at: user.created_at
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      logger.error('User creation failed:', error);
      throw new BusinessLogicError('USER_CREATION_FAILED', 'Failed to create user');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId, orgId) {
    try {
      const user = await userRepository.findById(userId, orgId);
      
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id,
        is_active: user.is_active,
        email_verified: user.email_verified,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to get user by ID:', error);
      throw new BusinessLogicError('USER_RETRIEVAL_FAILED', 'Failed to retrieve user');
    }
  }

  /**
   * List users in organization (admin only)
   */
  async listOrgUsers(orgId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;

      const users = await userRepository.listByOrg(orgId, limit, offset);
      const totalCount = await userRepository.countByOrg(orgId);

      const formattedUsers = users.map(user => ({
        user_id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        last_login_at: user.last_login_at,
        failed_login_attempts: user.failed_login_attempts,
        locked_until: user.locked_until,
        created_at: user.created_at,
        updated_at: user.updated_at
      }));

      return {
        users: formattedUsers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Failed to list organization users:', error);
      throw new BusinessLogicError('USER_LIST_FAILED', 'Failed to retrieve users');
    }
  }

  /**
   * Update user role (owner only)
   */
  async updateUserRole(userId, newRole, orgId, updatedBy) {
    try {
      logger.audit('User role update started', { userId, newRole, orgId, updatedBy });
      
      // Validate role
      if (!Object.values(USER_ROLES).includes(newRole)) {
        throw new ValidationError('INVALID_ROLE', `Role must be one of: ${Object.values(USER_ROLES).join(', ')}`);
      }

      // Get current user
      const user = await userRepository.findById(userId, orgId);
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      // Prevent changing own role
      if (userId === updatedBy) {
        throw new AuthorizationError('CANNOT_CHANGE_OWN_ROLE', 'Cannot change your own role');
      }

      // Prevent removing the last owner
      if (user.role === USER_ROLES.OWNER && newRole !== USER_ROLES.OWNER) {
        const ownerCount = await userRepository.countByOrgAndRole(orgId, USER_ROLES.OWNER);
        if (ownerCount <= 1) {
          throw new BusinessLogicError('LAST_OWNER_PROTECTION', 'Cannot remove the last owner from organization');
        }
      }

      // Update role
      const updatedUser = await userRepository.updateRole(userId, newRole, orgId);

      // Log role change
      await auditRepository.log({
        org_id: orgId,
        user_id: updatedBy,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: userId,
        details: {
          target_user_email: user.email,
          old_role: user.role,
          new_role: newRole
        }
      });

      logger.audit('User role updated successfully', {
        userId,
        oldRole: user.role,
        newRole,
        updatedBy
      });

      return {
        user_id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        org_id: updatedUser.org_id,
        is_active: updatedUser.is_active,
        updated_at: updatedUser.updated_at
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthorizationError || 
          error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      logger.error('User role update failed:', error);
      throw new BusinessLogicError('ROLE_UPDATE_FAILED', 'Failed to update user role');
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId, updates, orgId) {
    try {
      logger.debug('User profile update started', { userId, orgId });
      
      // Get current user
      const user = await userRepository.findById(userId, orgId);
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      // Validate and sanitize updates
      const allowedUpdates = ['email'];
      const sanitizedUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key) && value !== undefined) {
          if (key === 'email') {
            if (!isValidEmail(value)) {
              throw new ValidationError('INVALID_EMAIL', 'Invalid email format');
            }
            
            // Check if email already exists in organization
            const existingUser = await userRepository.findByEmailAndOrg(value, orgId);
            if (existingUser && existingUser.id !== userId) {
              throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
            }
            
            sanitizedUpdates.email = value.toLowerCase().trim();
            sanitizedUpdates.email_verified = false; // Reset verification on email change
          }
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        throw new ValidationError('NO_VALID_UPDATES', 'No valid updates provided');
      }

      // Update user
      const updatedUser = await userRepository.update(userId, sanitizedUpdates, orgId);

      // Log profile update
      await auditRepository.log({
        org_id: orgId,
        user_id: userId,
        action: AUDIT_ACTIONS.USER_UPDATED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: userId,
        details: {
          updated_fields: Object.keys(sanitizedUpdates)
        }
      });

      logger.audit('User profile updated successfully', { userId, updatedFields: Object.keys(sanitizedUpdates) });

      return {
        user_id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        org_id: updatedUser.org_id,
        is_active: updatedUser.is_active,
        email_verified: updatedUser.email_verified,
        updated_at: updatedUser.updated_at
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error('User profile update failed:', error);
      throw new BusinessLogicError('PROFILE_UPDATE_FAILED', 'Failed to update user profile');
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId, currentPassword, newPassword, orgId) {
    try {
      logger.audit('Password change started', { userId, orgId });
      
      // Get current user
      const user = await userRepository.findByIdWithPassword(userId, orgId);
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await cryptoService.comparePassword(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
      }

      // Validate new password
      cryptoService.validatePassword(newPassword);

      // Check if new password is different from current
      const isSamePassword = await cryptoService.comparePassword(newPassword, user.password_hash);
      if (isSamePassword) {
        throw new ValidationError('SAME_PASSWORD', 'New password must be different from current password');
      }

      // Hash new password
      const newPasswordHash = await cryptoService.hashPassword(newPassword);

      // Update password
      await userRepository.updatePassword(userId, newPasswordHash, orgId);

      // Revoke all existing sessions for security
      await tokenRepository.revokeAllUserTokens(userId);

      // Log password change
      await auditRepository.log({
        org_id: orgId,
        user_id: userId,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: userId
      });

      logger.audit('Password changed successfully', { userId });

      return { success: true, message: 'Password changed successfully. Please login again.' };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthenticationError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Password change failed:', error);
      throw new BusinessLogicError('PASSWORD_CHANGE_FAILED', 'Failed to change password');
    }
  }

  /**
   * Activate/Deactivate user (admin only)
   */
  async toggleUserStatus(userId, isActive, orgId, updatedBy) {
    try {
      logger.audit('User status toggle started', { userId, isActive, orgId, updatedBy });
      
      // Get current user
      const user = await userRepository.findById(userId, orgId);
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      // Prevent deactivating own account
      if (userId === updatedBy && !isActive) {
        throw new AuthorizationError('CANNOT_DEACTIVATE_SELF', 'Cannot deactivate your own account');
      }

      // Prevent deactivating the last owner
      if (user.role === USER_ROLES.OWNER && !isActive) {
        const activeOwnerCount = await userRepository.countActiveByOrgAndRole(orgId, USER_ROLES.OWNER);
        if (activeOwnerCount <= 1) {
          throw new BusinessLogicError('LAST_OWNER_PROTECTION', 'Cannot deactivate the last active owner');
        }
      }

      // Update user status
      const updatedUser = await userRepository.updateStatus(userId, isActive, orgId);

      // Revoke all sessions if deactivating
      if (!isActive) {
        await tokenRepository.revokeAllUserTokens(userId);
      }

      // Log status change
      await auditRepository.log({
        org_id: orgId,
        user_id: updatedBy,
        action: isActive ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: userId,
        details: {
          target_user_email: user.email,
          new_status: isActive ? 'active' : 'inactive'
        }
      });

      logger.audit('User status toggled successfully', { userId, isActive, updatedBy });

      return {
        user_id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
        updated_at: updatedUser.updated_at
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError || error instanceof BusinessLogicError) {
        throw error;
      }
      logger.error('User status toggle failed:', error);
      throw new BusinessLogicError('STATUS_UPDATE_FAILED', 'Failed to update user status');
    }
  }

  /**
   * Unlock user account (admin only)
   */
  async unlockUser(userId, orgId, unlockedBy) {
    try {
      logger.audit('User unlock started', { userId, orgId, unlockedBy });
      
      // Get current user
      const user = await userRepository.findById(userId, orgId);
      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND', 'User not found');
      }

      if (!user.locked_until || user.locked_until <= new Date()) {
        throw new ValidationError('USER_NOT_LOCKED', 'User account is not locked');
      }

      // Unlock user
      await userRepository.unlockAccount(userId);

      // Log unlock action
      await auditRepository.log({
        org_id: orgId,
        user_id: unlockedBy,
        action: AUDIT_ACTIONS.ACCOUNT_UNLOCKED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'user',
        resource_id: userId,
        details: {
          target_user_email: user.email,
          unlocked_by_admin: true
        }
      });

      logger.audit('User unlocked successfully', { userId, unlockedBy });

      return { success: true, message: 'User account unlocked successfully' };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('User unlock failed:', error);
      throw new BusinessLogicError('UNLOCK_FAILED', 'Failed to unlock user account');
    }
  }
}

module.exports = new UserService();