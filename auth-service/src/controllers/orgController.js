const orgService = require('../services/orgService');
const { successResponse, errorResponse } = require('../utils/responses');
const { validateOrgRegistration, validateOrgUpdate } = require('../validators/orgValidator');
const logger = require('../utils/logger');
const { AUDIT_ACTIONS } = require('../utils/constants');

/**
 * Organization Controller
 * Handles all organization-related endpoints including registration, management, and member operations
 */
class OrgController {
  /**
   * POST /v1/org/register
   * Register a new organization (public endpoint)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async register(req, res, next) {
    try {
      logger.debug('Organization registration endpoint called', { 
        orgName: req.body.org_name,
        adminEmail: req.body.admin_email 
      });

      // Validate input
      const { error, value } = validateOrgRegistration(req.body);
      if (error) {
        logger.warn('Organization registration validation failed', { 
          error: error.details[0].message,
          orgName: req.body.org_name 
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

      // Call organization service
      const result = await orgService.registerOrganization(
        value.org_name,
        value.admin_email,
        value.admin_password,
        clientInfo
      );

      logger.info('Organization registration successful', { 
        orgId: result.org_id,
        orgName: result.org_name,
        adminUserId: result.admin_user.user_id 
      });

      return res.status(201).json(
        successResponse(
          result, 
          'Organization registered successfully. Save client_secret immediately!'
        )
      );
    } catch (error) {
      logger.error('Organization registration endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/org/details
   * Get organization details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getDetails(req, res, next) {
    try {
      logger.debug('Get organization details endpoint called', { 
        orgId: req.org_id,
        userId: req.user?.user_id 
      });

      // Call organization service
      const details = await orgService.getOrgDetails(req.org_id);

      logger.info('Organization details retrieved', { 
        orgId: req.org_id,
        userId: req.user?.user_id 
      });

      return res.status(200).json(
        successResponse(details, 'Organization details retrieved successfully')
      );
    } catch (error) {
      logger.error('Get organization details endpoint error:', error);
      next(error);
    }
  }

  /**
   * PUT /v1/org/details
   * Update organization details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateDetails(req, res, next) {
    try {
      logger.debug('Update organization details endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      // Check permission - only owner can update org details
      if (req.user.role !== 'owner') {
        logger.warn('Unauthorized organization update attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only organization owner can update organization details'
          )
        );
      }

      // Validate input
      const { error, value } = validateOrgUpdate(req.body);
      if (error) {
        logger.warn('Organization update validation failed', { 
          error: error.details[0].message,
          orgId: req.org_id 
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

      // Call organization service
      const result = await orgService.updateOrgDetails(
        req.org_id,
        value,
        clientInfo
      );

      logger.info('Organization details updated', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      return res.status(200).json(
        successResponse(result, 'Organization details updated successfully')
      );
    } catch (error) {
      logger.error('Update organization details endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/org/members
   * Get organization members list
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getMembers(req, res, next) {
    try {
      logger.debug('Get organization members endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      // Check permission - only admin and owner can view members
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized members list access attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can view organization members'
          )
        );
      }

      // Parse query parameters for pagination
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 per page
      const search = req.query.search || '';
      const role = req.query.role || '';

      // Call organization service
      const result = await orgService.getOrgMembers(req.org_id, {
        page,
        limit,
        search,
        role
      });

      logger.info('Organization members retrieved', { 
        orgId: req.org_id,
        userId: req.user.user_id,
        totalMembers: result.total 
      });

      return res.status(200).json(
        successResponse(result, 'Organization members retrieved successfully')
      );
    } catch (error) {
      logger.error('Get organization members endpoint error:', error);
      next(error);
    }
  }

  /**
   * POST /v1/org/members/invite
   * Invite new member to organization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async inviteMember(req, res, next) {
    try {
      logger.debug('Invite organization member endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id,
        inviteEmail: req.body.email 
      });

      // Check permission - only admin and owner can invite members
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized member invite attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can invite organization members'
          )
        );
      }

      // Validate input
      const { error, value } = validateMemberInvite(req.body);
      if (error) {
        logger.warn('Member invite validation failed', { 
          error: error.details[0].message,
          orgId: req.org_id 
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
        invitedBy: req.user.user_id
      };

      // Call organization service
      const result = await orgService.inviteMember(
        req.org_id,
        value.email,
        value.role || 'user',
        clientInfo
      );

      logger.info('Member invitation sent', { 
        orgId: req.org_id,
        userId: req.user.user_id,
        inviteEmail: value.email,
        inviteId: result.invite_id 
      });

      return res.status(201).json(
        successResponse(result, 'Member invitation sent successfully')
      );
    } catch (error) {
      logger.error('Invite organization member endpoint error:', error);
      next(error);
    }
  }

  /**
   * DELETE /v1/org/members/:memberId
   * Remove member from organization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async removeMember(req, res, next) {
    try {
      const memberId = req.params.memberId;
      
      logger.debug('Remove organization member endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id,
        memberId 
      });

      // Check permission - only admin and owner can remove members
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized member removal attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id,
          memberId
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can remove organization members'
          )
        );
      }

      // Prevent self-removal
      if (memberId === req.user.user_id) {
        return res.status(400).json(
          errorResponse(
            'INVALID_OPERATION', 
            'Cannot remove yourself from the organization'
          )
        );
      }

      // Extract client information for audit logging
      const clientInfo = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        removedBy: req.user.user_id
      };

      // Call organization service
      await orgService.removeMember(
        req.org_id,
        memberId,
        clientInfo
      );

      logger.info('Member removed from organization', { 
        orgId: req.org_id,
        userId: req.user.user_id,
        memberId 
      });

      return res.status(200).json(
        successResponse({}, 'Member removed from organization successfully')
      );
    } catch (error) {
      logger.error('Remove organization member endpoint error:', error);
      next(error);
    }
  }

  /**
   * GET /v1/org/settings
   * Get organization settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getSettings(req, res, next) {
    try {
      logger.debug('Get organization settings endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      // Check permission - only admin and owner can view settings
      if (!['owner', 'admin'].includes(req.user.role)) {
        logger.warn('Unauthorized settings access attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only admin or owner can view organization settings'
          )
        );
      }

      // Call organization service
      const settings = await orgService.getOrgSettings(req.org_id);

      logger.info('Organization settings retrieved', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      return res.status(200).json(
        successResponse(settings, 'Organization settings retrieved successfully')
      );
    } catch (error) {
      logger.error('Get organization settings endpoint error:', error);
      next(error);
    }
  }

  /**
   * PUT /v1/org/settings
   * Update organization settings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateSettings(req, res, next) {
    try {
      logger.debug('Update organization settings endpoint called', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      // Check permission - only owner can update settings
      if (req.user.role !== 'owner') {
        logger.warn('Unauthorized settings update attempt', {
          userId: req.user.user_id,
          role: req.user.role,
          orgId: req.org_id
        });
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            'Only organization owner can update settings'
          )
        );
      }

      // Validate input
      const { error, value } = validateOrgSettings(req.body);
      if (error) {
        logger.warn('Organization settings validation failed', { 
          error: error.details[0].message,
          orgId: req.org_id 
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

      // Call organization service
      const result = await orgService.updateOrgSettings(
        req.org_id,
        value,
        clientInfo
      );

      logger.info('Organization settings updated', { 
        orgId: req.org_id,
        userId: req.user.user_id 
      });

      return res.status(200).json(
        successResponse(result, 'Organization settings updated successfully')
      );
    } catch (error) {
      logger.error('Update organization settings endpoint error:', error);
      next(error);
    }
  }
}

module.exports = new OrgController();