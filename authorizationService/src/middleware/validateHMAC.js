const crypto = require('crypto');
const orgRepository = require('../persistence/orgRepository');
const cryptoService = require('../services/cryptoService');
const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');

module.exports = async (req, res, next) => {
  try {
    const clientId = req.headers['x-client-id'];
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];

    if (!clientId || !timestamp || !signature) {
      logger.warn('Missing HMAC headers', { ip: req.ip });
      return res.status(401).json(
        errorResponse('MISSING_HMAC_HEADER', 'Missing required HMAC headers')
      );
    }

    // Check timestamp freshness (5-minute window)
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();

    if (Number.isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
      logger.warn('Expired request timestamp', { ip: req.ip, timestamp });
      return res.status(401).json(
        errorResponse('EXPIRED_REQUEST', 'Request timestamp expired')
      );
    }

    // Lookup organization
    const clientIdHash = crypto.createHash('sha256').update(clientId).digest('hex');
    const org = await orgRepository.findByClientIdHash(clientIdHash);

    if (!org) {
      logger.warn('Invalid client ID', { client_id: clientId, ip: req.ip });
      return res.status(401).json(
        errorResponse('INVALID_CLIENT_ID', 'Invalid client ID')
      );
    }

    // Verify signature
    const payload = {
      method: req.method,
      path: req.path,
      timestamp: timestamp,
      body: req.body || {}
    };

    try {
      cryptoService.verifyHMAC(signature, org.client_secret_hash, payload);
    } catch (error) {
      logger.warn('Invalid HMAC signature', { org_id: org.id, ip: req.ip });
      return res.status(401).json(
        errorResponse('INVALID_SIGNATURE', 'HMAC signature verification failed')
      );
    }

    // Inject org_id into request
    req.org_id = org.id;
    logger.debug('HMAC validation successful', { org_id: org.id });
    next();
  } catch (error) {
    logger.error('HMAC validation error', { error: error.message });
    next(error);
  }
};
