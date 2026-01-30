const { v4: uuid } = require('uuid');
const orgRepository = require('../persistence/orgRepository');
const userRepository = require('../persistence/userRepository');
const cryptoService = require('./cryptoService');
const auditRepository = require('../persistence/auditRepository');
const { ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../utils/constants');
const logger = require('../utils/logger');

class OrgService {
  async registerOrganization(orgName, adminEmail, adminPassword) {
    try {
      // 1. Check if organization already exists
      const existingOrg = await orgRepository.findByName(orgName);
      if (existingOrg) {
        throw new ValidationError('ORG_ALREADY_EXISTS', `Organization with name "${orgName}" already exists`);
      }

      // 2. Validate password
      cryptoService.validatePassword(adminPassword);

      // 3. Generate HMAC credentials
      const clientId = `pk_${uuid().replace(/-/g, '').substring(0, 32)}`;
      const clientSecret = `sk_${uuid().replace(/-/g, '').substring(0, 64)}`;

      // 4. Hash credentials
      const clientIdHash = cryptoService.hashClientId(clientId);
      const clientSecretHash = cryptoService.hashClientSecret(clientSecret);

      // 5. Hash admin password
      const passwordHash = await cryptoService.hashPassword(adminPassword);

      // 6. Create organization
      const org = await orgRepository.create({
        name: orgName,
        client_id_hash: clientIdHash,
        client_secret_hash: clientSecretHash,
        client_id_prefix: clientId.substring(0, 20)
      });

      // 7. Create admin user
      const adminUser = await userRepository.create({
        org_id: org.id,
        email: adminEmail,
        password_hash: passwordHash,
        role: 'owner'
      });

      // 8. Log org creation
      await auditRepository.log({
        org_id: org.id,
        user_id: adminUser.id,
        action: AUDIT_ACTIONS.ORG_REGISTERED,
        status: 'success'
      });

      logger.info('Organization registered', { 
        org_id: org.id, 
        org_name: orgName,
        admin_email: adminEmail 
      });

      return {
        org_id: org.id,
        org_name: org.name,
        client_id: clientId,
        client_secret: clientSecret,
        admin_user: {
          user_id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role
        },
        warning: 'Save client_secret now. It cannot be retrieved later.'
      };
    } catch (error) {
      throw error;
    }
  }

  async getOrgDetails(orgId) {
    try {
      const org = await orgRepository.findById(orgId);

      if (!org) {
        throw new ValidationError('ORG_NOT_FOUND', 'Organization not found');
      }

      return {
        org_id: org.id,
        org_name: org.name,
        is_active: org.is_active,
        created_at: org.created_at,
        updated_at: org.updated_at
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new OrgService();
