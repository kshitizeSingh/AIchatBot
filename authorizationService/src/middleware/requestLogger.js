const logger = require('../utils/logger');

module.exports = (req, res, next) => {
  const start = Date.now();

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.user_id || 'anonymous',
      orgId: req.org_id || 'N/A'
    });

    return originalJson.call(this, data);
  };

  next();
};
