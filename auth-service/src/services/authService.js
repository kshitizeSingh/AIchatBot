const userRepository = require('../persistence/userRepository');
const tokenRepository = require('../persistence/tokenRepository');
const auditRepository = require('../persistence/auditRepository');
const tokenService = require('./tokenService');
const cryptoService = require('./cryptoService');
const { AuthenticationError, ValidationError, BusinessLogicError } = require('../utils/errors');
const { AUDIT_ACTIONS, AUDIT_STATUS, SECURITY_SETTINGS } = require('../utils/constants');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Login user and return tokens
   */
  async login(email, password, orgId, clientInfo = {}) {
    try {
      logger.audit('Login attempt started', { email, orgId });
      
      // 1. Fetch user from database
      const user = await userRepository.findByEmailAndOrg(email, orgId);
      
      if (!user) {
        await this._logFailedLogin(null, orgId, 'USER_NOT_FOUND', clientInfo);
        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 2. Check if account is locked
      if (user.locked_until && user.locked_until > new Date()) {
        await this._logFailedLogin(user.id, orgId, 'ACCOUNT_LOCKED', clientInfo);
        const lockExpiry = new Date(user.locked_until).toISOString();
        throw new AuthenticationError('ACCOUNT_LOCKED', 
          `Account locked due to failed login attempts. Try again after ${lockExpiry}`
        );
      }

      // 3. Check if account is active
      if (!user.is_active) {
        await this._logFailedLogin(user.id, orgId, 'ACCOUNT_INACTIVE', clientInfo);
        throw new AuthenticationError('ACCOUNT_INACTIVE', 'Account has been deactivated');
      }

      // 4. Verify password
      const isPasswordValid = await cryptoService.comparePassword(password, user.password_hash);
      
      if (!isPasswordValid) {
        await this._handleFailedLogin(user, orgId, clientInfo);
        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 5. Check for password expiry (if implemented)
      if (this._isPasswordExpired(user)) {
        logger.security('Password expired for user', { userId: user.id, email });
        throw new AuthenticationError('PASSWORD_EXPIRED', 'Password has expired and must be changed');
      }

      // 6. Generate tokens
      const accessToken = tokenService.generateAccessToken(user.id, orgId, {
        role: user.role,
        email: user.email
      });
      
      const refreshTokenData = tokenService.generateRefreshToken(user.id, orgId);
      
      // 7. Store refresh token in database
      const tokenHash = cryptoService.hashToken(refreshTokenData.tokenId);
      await tokenRepository.create({
        user_id: user.id,
        org_id: orgId,
        token_hash: tokenHash,
        token_id: refreshTokenData.tokenId,
        expires_at: refreshTokenData.expiresAt
      });

      // 8. Update login timestamp and reset failed attempts
      await userRepository.recordSuccessfulLogin(user.id);

      // 9. Log successful login
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        status: AUDIT_STATUS.SUCCESS,
        details: {
          ip_address: clientInfo.ipAddress,
          user_agent: clientInfo.userAgent
        }
      });

      logger.audit('Login successful', { userId: user.id, email, orgId });

      return {
        access_token: accessToken,
        refresh_token: refreshTokenData.token,
        expires_in: tokenService.accessExpiry,
        token_type: 'Bearer',
        user: {
          user_id: user.id,
          email: user.email,
          role: user.role,
          org_id: user.org_id,
          last_login_at: new Date().toISOString()
        }
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      logger.error('Login failed with unexpected error:', error);
      throw new AuthenticationError('LOGIN_FAILED', 'Authentication failed');
    }
  }

  /**
   * Register new user for organization
   */
  async signup(email, password, orgId, additionalData = {}) {
    try {
      logger.audit('User signup started', { email, orgId });
      
      // 1. Check if user already exists
      const existingUser = await userRepository.findByEmailAndOrg(email, orgId);
      
      if (existingUser) {
        throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
      }

      // 2. Validate password
      cryptoService.validatePassword(password);

      // 3. Hash password
      const passwordHash = await cryptoService.hashPassword(password);

      // 4. Create user
      const userData = {
        org_id: orgId,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role: additionalData.role || 'user',
        ...additionalData
      };

      const user = await userRepository.create(userData);

      // 5. Log signup
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: AUDIT_ACTIONS.USER_CREATED,
        status: AUDIT_STATUS.SUCCESS,
        details: {
          email: user.email,
          role: user.role,
          created_by: additionalData.created_by || 'self-registration'
        }
      });

      logger.audit('User signup successful', { userId: user.id, email, orgId });

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id,
        is_active: user.is_active,
        created_at: user.created_at
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      logger.error('Signup failed with unexpected error:', error);
      throw new ValidationError('SIGNUP_FAILED', 'User registration failed');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken, orgId, clientInfo = {}) {
    try {
      logger.debug('Token refresh attempt started');
      
      // 1. Verify refresh token
      const payload = tokenService.verifyRefreshToken(refreshToken);

      // 2. Check if token exists and is not revoked
      const tokenRecord = await tokenRepository.findByTokenId(payload.token_id);
      
      if (!tokenRecord || tokenRecord.is_revoked) {
        // Possible token theft - log security event
        await auditRepository.log({
          org_id: orgId,
          user_id: payload.user_id,
          action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
          status: AUDIT_STATUS.WARNING,
          details: {
            token_id: payload.token_id,
            ip_address: clientInfo.ipAddress,
            user_agent: clientInfo.userAgent
          }
        });
        
        logger.security('Token reuse detected', { tokenId: payload.token_id, userId: payload.user_id });
        throw new AuthenticationError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked');
      }

      // 3. Verify user still exists and is active
      const user = await userRepository.findById(payload.user_id, orgId);
      if (!user || !user.is_active) {
        throw new AuthenticationError('USER_INACTIVE', 'User account is inactive');
      }

      // 4. Generate new tokens
      const newAccessToken = tokenService.generateAccessToken(payload.user_id, orgId, {
        role: user.role,
        email: user.email
      });
      
      const newRefreshTokenData = tokenService.generateRefreshToken(payload.user_id, orgId);

      // 5. Store new refresh token
      const newTokenHash = cryptoService.hashToken(newRefreshTokenData.tokenId);
      await tokenRepository.create({
        user_id: payload.user_id,
        org_id: orgId,
        token_hash: newTokenHash,
        token_id: newRefreshTokenData.tokenId,
        expires_at: newRefreshTokenData.expiresAt
      });

      // 6. Revoke old refresh token
      await tokenRepository.revokeToken(payload.token_id);

      // 7. Log token refresh
      await auditRepository.log({
        org_id: orgId,
        user_id: payload.user_id,
        action: AUDIT_ACTIONS.TOKEN_REFRESH,
        status: AUDIT_STATUS.SUCCESS,
        details: {
          old_token_id: payload.token_id,
          new_token_id: newRefreshTokenData.tokenId
        }
      });

      logger.debug('Token refresh successful', { userId: payload.user_id });

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshTokenData.token,
        expires_in: tokenService.accessExpiry,
        token_type: 'Bearer'
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      logger.error('Token refresh failed with unexpected error:', error);
      throw new AuthenticationError('TOKEN_REFRESH_FAILED', 'Failed to refresh token');
    }
  }

  /**
   * Logout user
   */
  async logout(userId, refreshToken, clientInfo = {}) {
    try {
      logger.debug('Logout attempt started', { userId });
      
      if (refreshToken) {
        const payload = tokenService.verifyRefreshToken(refreshToken);
        
        if (payload.user_id !== userId) {
          throw new ValidationError('TOKEN_MISMATCH', 'Token does not match user');
        }

        // Revoke refresh token
        await tokenRepository.revokeToken(payload.token_id);
      }

      // Log logout
      await auditRepository.log({
        user_id: userId,
        action: AUDIT_ACTIONS.LOGOUT,
        status: AUDIT_STATUS.SUCCESS,
        details: {
          ip_address: clientInfo.ipAddress,
          user_agent: clientInfo.userAgent
        }
      });

      logger.audit('Logout successful', { userId });
      return { success: true };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        throw error;
      }
      logger.error('Logout failed with unexpected error:', error);
      throw new BusinessLogicError('LOGOUT_FAILED', 'Failed to logout user');
    }
  }

  /**
   * Revoke all user sessions
   */
  async revokeAllSessions(userId, orgId, clientInfo = {}) {
    try {
      logger.audit('Revoking all sessions', { userId });
      
      // Revoke all refresh tokens for the user
      await tokenRepository.revokeAllUserTokens(userId);

      // Log security action
      await auditRepository.log({
        org_id: orgId,
        user_id: userId,
        action: 'all_sessions_revoked',
        status: AUDIT_STATUS.SUCCESS,
        details: {
          reason: 'security_action',
          ip_address: clientInfo.ipAddress,
          user_agent: clientInfo.userAgent
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to revoke all sessions:', error);
      throw new BusinessLogicError('SESSION_REVOCATION_FAILED', 'Failed to revoke user sessions');
    }
  }

  /**
   * Handle failed login attempt
   */
  async _handleFailedLogin(user, orgId, clientInfo) {
    try {
      // Increment failed login attempts
      await userRepository.incrementFailedLoginAttempts(user.id);
      
      // Check if should lock account
      if (user.failed_login_attempts + 1 >= SECURITY_SETTINGS.MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + SECURITY_SETTINGS.LOCKOUT_DURATION_MINUTES);
        
        await userRepository.lockAccount(user.id, lockUntil);
        
        // Log security event
        await auditRepository.log({
          org_id: orgId,
          user_id: user.id,
          action: AUDIT_ACTIONS.LOGIN_LOCKED,
          status: AUDIT_STATUS.WARNING,
          details: {
            failed_attempts: user.failed_login_attempts + 1,
            locked_until: lockUntil.toISOString(),
            ip_address: clientInfo.ipAddress,
            user_agent: clientInfo.userAgent
          }
        });
        
        logger.security('Account locked due to failed login attempts', {
          userId: user.id,
          attempts: user.failed_login_attempts + 1,
          lockedUntil: lockUntil
        });
      } else {
        await this._logFailedLogin(user.id, orgId, 'INVALID_PASSWORD', clientInfo);
      }
    } catch (error) {
      logger.error('Failed to handle failed login:', error);
    }
  }

  /**
   * Log failed login attempt
   */
  async _logFailedLogin(userId, orgId, reason, clientInfo) {
    try {
      await auditRepository.log({
        org_id: orgId,
        user_id: userId,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        status: AUDIT_STATUS.FAILURE,
        details: {
          reason,
          ip_address: clientInfo.ipAddress,
          user_agent: clientInfo.userAgent
        }
      });
    } catch (error) {
      logger.error('Failed to log failed login:', error);
    }
  }

  /**
   * Check if password is expired
   */
  _isPasswordExpired(user) {
    if (!user.last_password_change) {
      return false; // No expiry if never changed
    }
    
    const passwordAge = Date.now() - new Date(user.last_password_change).getTime();
    const maxPasswordAge = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
    
    return passwordAge > maxPasswordAge;
  }
}

module.exports = new AuthService();