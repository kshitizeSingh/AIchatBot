const { v4: uuid } = require('uuid');
const orgRepository = require('../persistence/orgRepository');
const userRepository = require('../persistence/userRepository');
const auditRepository = require('../persistence/auditRepository');
const cryptoService = require('./cryptoService');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../utils/errors');
const { USER_ROLES, AUDIT_ACTIONS, AUDIT_STATUS } = require('../utils/constants');
const { isValidEmail, cleanObject } = require('../utils/helpers');
const logger = require('../utils/logger');

class OrgService {
  /**
   * Register new organization
   * Returns: org_id, client_id, client_secret
   */
  async registerOrganization(orgName, adminEmail, adminPassword) {
    try {
      logger.audit('Organization registration started', { orgName, adminEmail });
      
      // Validate input
      if (!orgName || orgName.trim().length < 2) {
        throw new ValidationError('INVALID_ORG_NAME', 'Organization name must be at least 2 characters');
      }

      if (!isValidEmail(adminEmail)) {
        throw new ValidationError('INVALID_EMAIL', 'Invalid admin email format');
      }

      // Validate password
      cryptoService.validatePassword(adminPassword);

      // Check if organization name already exists
      const existingOrg = await orgRepository.findByName(orgName.trim());
      if (existingOrg) {
        throw new ValidationError('DUPLICATE_ORG_NAME', 'Organization name already exists');
      }

      // Generate HMAC credentials
      const credentials = cryptoService.generateClientCredentials();

      // Hash admin password
      const passwordHash = await cryptoService.hashPassword(adminPassword);

      // Create organization
      const orgData = {
        name: orgName.trim(),
        client_id_hash: credentials.clientIdHash,
        client_secret_hash: credentials.clientSecretHash,
        client_id_prefix: credentials.clientIdPrefix
      };

      const org = await orgRepository.create(orgData);

      // Create admin user
      const adminUserData = {
        org_id: org.id,
        email: adminEmail.toLowerCase().trim(),
        password_hash: passwordHash,
        role: USER_ROLES.OWNER,
        email_verified: false
      };

      const adminUser = await userRepository.create(adminUserData);

      // Log org creation
      await auditRepository.log({
        org_id: org.id,
        user_id: adminUser.id,
        action: AUDIT_ACTIONS.ORG_CREATED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'organization',
        resource_id: org.id,
        details: {
          org_name: org.name,
          admin_email: adminUser.email
        }
      });

      logger.audit('Organization registered successfully', {
        orgId: org.id,
        orgName: org.name,
        adminUserId: adminUser.id,
        adminEmail: adminUser.email
      });

      return {
        org_id: org.id,
        org_name: org.name,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        admin_user: {
          user_id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role
        },
        created_at: org.created_at,
        warning: 'Save client_secret now. It cannot be retrieved later.'
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      logger.error('Organization registration failed:', error);
      throw new BusinessLogicError('ORG_REGISTRATION_FAILED', 'Failed to register organization');
    }
  }

  /**
   * Get organization details
   */
  async getOrgDetails(orgId) {
    try {
      const org = await orgRepository.findById(orgId);
      
      if (!org) {
        throw new NotFoundError('ORG_NOT_FOUND', 'Organization not found');
      }

      // Get organization statistics
      const stats = await this._getOrgStatistics(orgId);

      return {
        org_id: org.id,
        org_name: org.name,
        client_id_prefix: org.client_id_prefix,
        is_active: org.is_active,
        created_at: org.created_at,
        updated_at: org.updated_at,
        statistics: stats
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to get organization details:', error);
      throw new BusinessLogicError('ORG_DETAILS_FAILED', 'Failed to retrieve organization details');
    }
  }

  /**
   * Update organization details
   */
  async updateOrganization(orgId, updates, updatedBy) {
    try {
      logger.audit('Organization update started', { orgId, updatedBy });
      
      // Get current organization
      const org = await orgRepository.findById(orgId);
      if (!org) {
        throw new NotFoundError('ORG_NOT_FOUND', 'Organization not found');
      }

      // Validate and sanitize updates
      const allowedUpdates = ['name'];
      const sanitizedUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key) && value !== undefined) {
          if (key === 'name') {
            if (!value || value.trim().length < 2) {
              throw new ValidationError('INVALID_ORG_NAME', 'Organization name must be at least 2 characters');
            }
            
            // Check if name already exists (excluding current org)
            const existingOrg = await orgRepository.findByName(value.trim());
            if (existingOrg && existingOrg.id !== orgId) {
              throw new ValidationError('DUPLICATE_ORG_NAME', 'Organization name already exists');
            }
            
            sanitizedUpdates.name = value.trim();
          }
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        throw new ValidationError('NO_VALID_UPDATES', 'No valid updates provided');
      }

      // Update organization
      const updatedOrg = await orgRepository.update(orgId, sanitizedUpdates);

      // Log organization update
      await auditRepository.log({
        org_id: orgId,
        user_id: updatedBy,
        action: AUDIT_ACTIONS.ORG_UPDATED,
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'organization',
        resource_id: orgId,
        details: {
          updated_fields: Object.keys(sanitizedUpdates),
          old_name: org.name,
          new_name: sanitizedUpdates.name
        }
      });

      logger.audit('Organization updated successfully', {
        orgId,
        updatedFields: Object.keys(sanitizedUpdates),
        updatedBy
      });

      return {
        org_id: updatedOrg.id,
        org_name: updatedOrg.name,
        client_id_prefix: updatedOrg.client_id_prefix,
        is_active: updatedOrg.is_active,
        updated_at: updatedOrg.updated_at
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Organization update failed:', error);
      throw new BusinessLogicError('ORG_UPDATE_FAILED', 'Failed to update organization');
    }
  }

  /**
   * Regenerate client credentials (owner only)
   */
  async regenerateCredentials(orgId, regeneratedBy, reason = 'security_rotation') {
    try {
      logger.audit('Credential regeneration started', { orgId, regeneratedBy, reason });
      
      // Get current organization
      const org = await orgRepository.findById(orgId);
      if (!org) {
        throw new NotFoundError('ORG_NOT_FOUND', 'Organization not found');
      }

      // Generate new credentials
      const newCredentials = cryptoService.generateClientCredentials();

      // Update organization with new credentials
      const updateData = {
        client_id_hash: newCredentials.clientIdHash,
        client_secret_hash: newCredentials.clientSecretHash,
        client_id_prefix: newCredentials.clientIdPrefix
      };

      await orgRepository.update(orgId, updateData);

      // Log credential regeneration
      await auditRepository.log({
        org_id: orgId,
        user_id: regeneratedBy,
        action: 'credentials_regenerated',
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'organization',
        resource_id: orgId,
        details: {
          reason,
          old_client_id_prefix: org.client_id_prefix,
          new_client_id_prefix: newCredentials.clientIdPrefix
        }
      });

      logger.security('Organization credentials regenerated', {
        orgId,
        reason,
        regeneratedBy,
        oldPrefix: org.client_id_prefix,
        newPrefix: newCredentials.clientIdPrefix
      });

      return {
        org_id: orgId,
        client_id: newCredentials.clientId,
        client_secret: newCredentials.clientSecret,
        client_id_prefix: newCredentials.clientIdPrefix,
        regenerated_at: new Date().toISOString(),
        warning: 'Save client_secret now. It cannot be retrieved later. Update all integrations with new credentials.'
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Credential regeneration failed:', error);
      throw new BusinessLogicError('CREDENTIAL_REGENERATION_FAILED', 'Failed to regenerate credentials');
    }
  }

  /**
   * Activate/Deactivate organization (system admin only)
   */
  async toggleOrgStatus(orgId, isActive, updatedBy) {
    try {
      logger.audit('Organization status toggle started', { orgId, isActive, updatedBy });
      
      // Get current organization
      const org = await orgRepository.findById(orgId);
      if (!org) {
        throw new NotFoundError('ORG_NOT_FOUND', 'Organization not found');
      }

      // Update organization status
      const updatedOrg = await orgRepository.updateStatus(orgId, isActive);

      // If deactivating, also deactivate all users and revoke all tokens
      if (!isActive) {
        await userRepository.deactivateAllOrgUsers(orgId);
        await tokenRepository.revokeAllOrgTokens(orgId);
      }

      // Log status change
      await auditRepository.log({
        org_id: orgId,
        user_id: updatedBy,
        action: isActive ? 'org_activated' : 'org_deactivated',
        status: AUDIT_STATUS.SUCCESS,
        resource_type: 'organization',
        resource_id: orgId,
        details: {
          org_name: org.name,
          new_status: isActive ? 'active' : 'inactive'
        }
      });

      logger.audit('Organization status toggled successfully', { orgId, isActive, updatedBy });

      return {
        org_id: updatedOrg.id,
        org_name: updatedOrg.name,
        is_active: updatedOrg.is_active,
        updated_at: updatedOrg.updated_at
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Organization status toggle failed:', error);
      throw new BusinessLogicError('ORG_STATUS_UPDATE_FAILED', 'Failed to update organization status');
    }
  }

  /**
   * Get organization statistics
   */
  async _getOrgStatistics(orgId) {
    try {
      const [totalUsers, activeUsers, adminUsers, ownerUsers] = await Promise.all([
        userRepository.countByOrg(orgId),
        userRepository.countActiveByOrg(orgId),
        userRepository.countByOrgAndRole(orgId, USER_ROLES.ADMIN),
        userRepository.countByOrgAndRole(orgId, USER_ROLES.OWNER)
      ]);

      return {
        total_users: totalUsers,
        active_users: activeUsers,
        inactive_users: totalUsers - activeUsers,
        admin_users: adminUsers,
        owner_users: ownerUsers,
        regular_users: totalUsers - adminUsers - ownerUsers
      };
    } catch (error) {
      logger.error('Failed to get organization statistics:', error);
      return {
        total_users: 0,
        active_users: 0,
        inactive_users: 0,
        admin_users: 0,
        owner_users: 0,
        regular_users: 0
      };
    }
  }

  /**
   * Get organization by client ID hash (for HMAC validation)
   */
  async getOrgByClientIdHash(clientIdHash) {
    try {
      const org = await orgRepository.findByClientIdHash(clientIdHash);
      return org;
    } catch (error) {
      logger.error('Failed to get organization by client ID hash:', error);
      return null;
    }
  }

  /**
   * List all organizations (system admin only)
   */
  async listOrganizations(pagination = {}, filters = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;

      const organizations = await orgRepository.list(filters, limit, offset);
      const totalCount = await orgRepository.count(filters);

      const formattedOrgs = await Promise.all(
        organizations.map(async (org) => {
          const stats = await this._getOrgStatistics(org.id);
          return {
            org_id: org.id,
            org_name: org.name,
            client_id_prefix: org.client_id_prefix,
            is_active: org.is_active,
            created_at: org.created_at,
            updated_at: org.updated_at,
            statistics: stats
          };
        })
      );

      return {
        organizations: formattedOrgs,
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
      logger.error('Failed to list organizations:', error);
      throw new BusinessLogicError('ORG_LIST_FAILED', 'Failed to retrieve organizations');
    }
  }
}

module.exports = new OrgService();