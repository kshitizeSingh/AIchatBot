const logger = require('../utils/logger');

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user?.role)) {
    logger.warn('Admin access denied', { user_id: req.user?.user_id, role: req.user?.role, path: req.path });
    return res.status(403).json({
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS',
      required_role: ['owner', 'admin'],
      current_role: req.user?.role,
    });
  }
  next();
};

module.exports = { requireAuth, requireAdmin };
