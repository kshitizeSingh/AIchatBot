/**
 * Service layer index file
 * Exports all service modules for easy importing
 */

const authService = require('./authService');
const userService = require('./userService');
const orgService = require('./orgService');
const tokenService = require('./tokenService');
const cryptoService = require('./cryptoService');

module.exports = {
  authService,
  userService,
  orgService,
  tokenService,
  cryptoService
};

// For backward compatibility, also export individual services
module.exports.auth = authService;
module.exports.user = userService;
module.exports.organization = orgService;
module.exports.token = tokenService;
module.exports.crypto = cryptoService;