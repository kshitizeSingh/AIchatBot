const crypto = require('crypto');
const orgRepository = require('../persistence/orgRepository');
const cryptoService = require('../services/cryptoService');
const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

/**
 * HMAC validation middleware
 * Validates client ID, timestamp, and HMAC signature for API requests
 */
module.exports = async (req, res, next) => {
  try {
    const clientId = req.headers['x-client-id'];
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];

    // Check required headers
    if (!clientId || !timestamp || !signature) {
      logger.warn('HMAC validation failed: Missing required headers', {
        clientId: !!clientId,
        timestamp: !!timestamp,
        signature: !!signature,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json(
        errorResponse('MISSING_HMAC_HEADER', 'Missing required HMAC headers: X-Client-ID, X-Timestamp, X-Signature')
      );
    }

    // Check timestamp freshness (5-minute window)
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);
    const maxTimeDiff = 5 * 60 * 1000; // 5 minutes

    if (isNaN(requestTime) || timeDiff > maxTimeDiff) {
      logger.warn('HMAC validation failed: Invalid or expired timestamp', {
        timestamp,
        requestTime,
        now,
        timeDiff,
        maxTimeDiff,
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('EXPIRED_REQUEST', 'Request timestamp is invalid or expired (max 5 minutes)')
      );
    }

    // Hash client ID and lookup organization
    const clientIdHash = crypto.createHash('sha256').update(clientId).digest('hex');
    const org = await orgRepository.findByClientIdHash(clientIdHash);

    if (!org) {
      logger.warn('HMAC validation failed: Invalid client ID', {
        clientId: clientId.substring(0, 10) + '...',
        clientIdHash: clientIdHash.substring(0, 16) + '...',
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('INVALID_CLIENT_ID', 'Invalid client ID')
      );
    }

    // Verify HMAC signature
    const payload = {
      method: req.method,
      path: req.path,
      timestamp: timestamp,
      body: req.body || {}
    };

    const isValidSignature = cryptoService.verifyHMAC(signature, org.client_secret_hash, payload);
    
    if (!isValidSignature) {
      logger.warn('HMAC validation failed: Invalid signature', {
        orgId: org.id,
        method: req.method,
        path: req.path,
        timestamp,
        ip: req.ip
      });
      
      return res.status(401).json(
        errorResponse('INVALID_SIGNATURE', 'HMAC signature verification failed')
      );
    }

    // Inject organization info into request
    req.org_id = org.id;
    req.organization = {
      id: org.id,
      name: org.name,
      is_active: org.is_active
    };

    logger.debug('HMAC validation successful', {
      orgId: org.id,
      orgName: org.name,
      method: req.method,
      path: req.path,
      ip: req.ip
    });

    next();
  } catch (error) {
    logger.error('HMAC validation error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    
    next(error);
  }
};