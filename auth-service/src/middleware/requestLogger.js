const logger = require('../utils/logger');
const { v4: uuid } = require('uuid');

/**
 * Request logging middleware
 * Logs incoming requests and responses with correlation IDs
 */
module.exports = (req, res, next) => {
  // Generate correlation ID for request tracking
  req.correlationId = uuid();
  
  // Start time for response time calculation
  const startTime = Date.now();
  
  // Extract relevant request information
  const requestInfo = {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    referer: req.get('Referer'),
    origin: req.get('Origin'),
    timestamp: new Date().toISOString()
  };

  // Log sensitive headers (masked)
  const sensitiveHeaders = {
    authorization: req.get('Authorization') ? 'Bearer ***' : undefined,
    'x-client-id': req.get('X-Client-ID') ? req.get('X-Client-ID').substring(0, 8) + '***' : undefined,
    'x-signature': req.get('X-Signature') ? '***' : undefined,
    'x-timestamp': req.get('X-Timestamp')
  };

  // Add non-sensitive headers
  Object.keys(sensitiveHeaders).forEach(key => {
    if (sensitiveHeaders[key]) {
      requestInfo[key] = sensitiveHeaders[key];
    }
  });

  // Log request body for non-GET requests (exclude sensitive data)
  if (req.method !== 'GET' && req.body) {
    const sanitizedBody = { ...req.body };
    
    // Remove sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = '***';
    if (sanitizedBody.admin_password) sanitizedBody.admin_password = '***';
    if (sanitizedBody.refresh_token) sanitizedBody.refresh_token = '***';
    
    requestInfo.body = sanitizedBody;
  }

  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    requestInfo.query = req.query;
  }

  // Log route parameters
  if (Object.keys(req.params).length > 0) {
    requestInfo.params = req.params;
  }

  // Log incoming request
  logger.info('Incoming request', requestInfo);

  // Capture original res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const responseTime = Date.now() - startTime;
    
    // Log response information
    const responseInfo = {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: JSON.stringify(body).length,
      timestamp: new Date().toISOString()
    };

    // Add user context if available
    if (req.user) {
      responseInfo.userId = req.user.user_id;
      responseInfo.userRole = req.user.role;
    }

    if (req.org_id) {
      responseInfo.orgId = req.org_id;
    }

    // Log response body for errors or in development mode
    if (res.statusCode >= 400 || process.env.NODE_ENV === 'development') {
      const sanitizedResponse = { ...body };
      
      // Remove sensitive data from response logs
      if (sanitizedResponse.data) {
        if (sanitizedResponse.data.access_token) sanitizedResponse.data.access_token = '***';
        if (sanitizedResponse.data.refresh_token) sanitizedResponse.data.refresh_token = '***';
        if (sanitizedResponse.data.client_secret) sanitizedResponse.data.client_secret = '***';
      }
      
      responseInfo.response = sanitizedResponse;
    }

    // Log response based on status code
    if (res.statusCode >= 500) {
      logger.error('Response sent', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('Response sent', responseInfo);
    } else {
      logger.info('Response sent', responseInfo);
    }

    // Call original json method
    return originalJson.call(this, body);
  };

  // Handle response end for non-JSON responses
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    if (!res.headersSent && !res.locals.jsonSent) {
      const responseTime = Date.now() - startTime;
      
      logger.info('Response sent (non-JSON)', {
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        contentLength: chunk ? chunk.length : 0,
        timestamp: new Date().toISOString()
      });
    }
    
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};