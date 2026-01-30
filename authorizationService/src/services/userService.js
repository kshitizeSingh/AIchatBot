const userRepository = require('../persistence/userRepository');
const cryptoService = require('./cryptoService');
const auditRepository = require('../persistence/auditRepository');
const { ValidationError, AuthorizationError } = require('../utils/errors');
const { VALID_ROLES, AUDIT_ACTIONS } = require('../utils/constants');
const logger = require('../utils/logger');

class UserService {
  async createUser(email, password, role, orgId, creatorId) {
    try {
      // 1. Validate role
      if (!VALID_ROLES.includes(role)) {
        throw new ValidationError('INVALID_ROLE', `Role must be one of: ${VALID_ROLES.join(', ')}`);
      }

      // 2. Check if user already exists
      const existingUser = await userRepository.findByEmailAndOrg(email, orgId);

      if (existingUser) {
        logger.warn('User creation attempt with duplicate email', { email, org_id: orgId });
        throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
      }

      // 3. Validate password
      cryptoService.validatePassword(password);

      // 4. Hash password
      const passwordHash = await cryptoService.hashPassword(password);

      // 5. Create user
      const user = await userRepository.create({
        org_id: orgId,
        email,
        password_hash: passwordHash,
        role
      });

      // 6. Log user creation
      await auditRepository.log({
        org_id: orgId,
        user_id: creatorId,
        action: AUDIT_ACTIONS.USER_CREATED,
        resource_type: 'user',
        resource_id: user.id,
        status: 'success'
      });

      logger.info('User created', { user_id: user.id, email, role, created_by: creatorId });

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id
      };
    } catch (error) {
      throw error;
    }
  }

  async listOrgUsers(orgId) {
    try {
      const users = await userRepository.listByOrg(orgId);
      
      return users.map(user => ({
        user_id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        created_at: user.created_at
      }));
    } catch (error) {
      throw error;
    }
  }

  async updateUserRole(userId, newRole, orgId, updaterId) {
    try {
      // 1. Validate role
      if (!VALID_ROLES.includes(newRole)) {
        throw new ValidationError('INVALID_ROLE', `Role must be one of: ${VALID_ROLES.join(', ')}`);
      }

      // 2. Check if user exists
      const user = await userRepository.findById(userId, orgId);

      if (!user) {
        throw new ValidationError('USER_NOT_FOUND', 'User not found');
      }

      // 3. Update role
      const updatedUser = await userRepository.updateRole(userId, newRole, orgId);

      // 4. Log role change
      await auditRepository.log({
        org_id: orgId,
        user_id: updaterId,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        resource_type: 'user',
        resource_id: userId,
        details: {
          old_role: user.role,
          new_role: newRole
        },
        status: 'success'
      });

      logger.info('User role updated', { 
        user_id: userId, 
        old_role: user.role, 
        new_role: newRole,
        updated_by: updaterId 
      });

      return {
        user_id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        org_id: updatedUser.org_id
      };
    } catch (error) {
      throw error;
    }
  }

  async getUserById(userId, orgId) {
    try {
      const user = await userRepository.findById(userId, orgId);

      if (!user) {
        throw new ValidationError('USER_NOT_FOUND', 'User not found');
      }

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id,
        is_active: user.is_active,
        created_at: user.created_at
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new UserService();
