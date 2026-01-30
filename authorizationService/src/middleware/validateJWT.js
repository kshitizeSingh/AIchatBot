const tokenService = require('../services/tokenService');
const userRepository = require('../persistence/userRepository');
const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header', { ip: req.ip });
      return res.status(401).json(
        errorResponse('MISSING_AUTH_HEADER', 'Authorization header is missing or invalid')
      );
    }

    const token = authHeader.substring(7);

    // Verify token
    const payload = tokenService.verifyToken(token);

    // Fetch user details
    const user = await userRepository.findByIdOnly(payload.user_id);

    if (!user) {
      logger.warn('User not found for token', { user_id: payload.user_id });
      return res.status(401).json(
        errorResponse('INVALID_TOKEN', 'User not found')
      );
    }

    // Check if org_id matches (from HMAC middleware)
    if (req.org_id && user.org_id !== req.org_id) {
      logger.warn('Organization mismatch', { 
        user_org: user.org_id, 
        header_org: req.org_id 
      });
      return res.status(403).json(
        errorResponse('ORG_MISMATCH', 'Organization mismatch')
      );
    }

    // Inject user into request
    req.user = {
      user_id: payload.user_id,
      org_id: user.org_id,
      role: user.role
    };

    logger.debug('JWT validation successful', { user_id: payload.user_id });
    next();
  } catch (error) {
    logger.warn('JWT validation failed', { error: error.message });
    return res.status(401).json(
      errorResponse(error.code || 'INVALID_TOKEN', error.message)
    );
  }
};
