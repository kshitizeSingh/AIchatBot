const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

/**
 * Role-based authorization middleware factory
 * Creates middleware that checks if user has required role(s)
 * 
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 * @param {object} options - Additional options
 * @param {boolean} options.requireOwnership - If true, user must own the resource
 * @param {string} options.resourceParam - Parameter name for resource ID (for ownership check)
 * @returns {Function} Express middleware function
 */
const roleAuth = (allowedRoles, options = {}) => {
  // Normalize allowedRoles to array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated (should be set by validateJWT middleware)
      if (!req.user) {
        logger.warn('Role authorization failed: No user in request', {
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        
        return res.status(401).json(
          errorResponse('AUTHENTICATION_REQUIRED', 'Authentication required for this endpoint')
        );
      }

      const { user_id, role, org_id } = req.user;

      // Check if user has required role
      if (!roles.includes(role)) {
        logger.warn('Role authorization failed: Insufficient role', {
          userId: user_id,
          userRole: role,
          requiredRoles: roles,
          path: req.path,
          method: req.method,
          orgId: org_id,
          ip: req.ip
        });
        
        return res.status(403).json(
          errorResponse(
            'INSUFFICIENT_PERMISSION', 
            `Access denied. Required role(s): ${roles.join(', ')}. Current role: ${role}`
          )
        );
      }

      // Check resource ownership if required
      if (options.requireOwnership && options.resourceParam) {
        const resourceId = req.params[options.resourceParam];
        
        if (!resourceId) {
          logger.warn('Role authorization failed: Missing resource parameter', {
            userId: user_id,
            resourceParam: options.resourceParam,
            path: req.path,
            method: req.method,
            params: req.params
          });
          
          return res.status(400).json(
            errorResponse('MISSING_RESOURCE_ID', `Missing resource parameter: ${options.resourceParam}`)
          );
        }

        // For user resources, check if user owns the resource or is admin/owner
        if (resourceId !== user_id && !['admin', 'owner'].includes(role)) {
          logger.warn('Role authorization failed: Resource ownership check failed', {
            userId: user_id,
            resourceId,
            userRole: role,
            path: req.path,
            method: req.method,
            orgId: org_id
          });
          
          return res.status(403).json(
            errorResponse('ACCESS_DENIED', 'You can only access your own resources')
          );
        }
      }

      logger.debug('Role authorization successful', {
        userId: user_id,
        userRole: role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
        orgId: org_id
      });

      next();
    } catch (error) {
      logger.error('Role authorization error', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.user_id,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      
      next(error);
    }
  };
};

// Predefined role middleware for common use cases
roleAuth.owner = () => roleAuth(['owner']);
roleAuth.admin = () => roleAuth(['owner', 'admin']);
roleAuth.user = () => roleAuth(['owner', 'admin', 'user']);

// Ownership-based middleware
roleAuth.ownerOrSelf = (resourceParam = 'id') => 
  roleAuth(['owner', 'admin', 'user'], { requireOwnership: true, resourceParam });

roleAuth.adminOrSelf = (resourceParam = 'id') => 
  roleAuth(['owner', 'admin', 'user'], { requireOwnership: true, resourceParam });

module.exports = roleAuth;