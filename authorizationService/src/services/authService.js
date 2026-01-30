const userRepository = require('../persistence/userRepository');
const tokenRepository = require('../persistence/tokenRepository');
const tokenService = require('./tokenService');
const cryptoService = require('./cryptoService');
const auditRepository = require('../persistence/auditRepository');
const { AuthenticationError, ValidationError } = require('../utils/errors');
const { ACCOUNT_LOCKOUT, AUDIT_ACTIONS } = require('../utils/constants');
const logger = require('../utils/logger');

class AuthService {
  async login(email, password, orgId) {
    try {
      // 1. Fetch user from database
      const user = await userRepository.findByEmailAndOrg(email, orgId);

      if (!user) {
        logger.warn('Login attempt with non-existent user', { email, org_id: orgId });
        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 2. Check if account is locked
      if (user.locked_until && user.locked_until > new Date()) {
        logger.warn('Login attempt on locked account', { user_id: user.id });
        throw new AuthenticationError('ACCOUNT_LOCKED', 
          'Account locked due to failed login attempts. Try again later.'
        );
      }

      // 3. Check if account is active
      if (!user.is_active) {
        logger.warn('Login attempt on inactive account', { user_id: user.id });
        throw new AuthenticationError('ACCOUNT_INACTIVE', 'Account has been deactivated');
      }

      // 4. Verify password
      const isPasswordValid = await cryptoService.comparePassword(password, user.password_hash);

      if (!isPasswordValid) {
        logger.warn('Failed login attempt', { user_id: user.id, email });
        await userRepository.incrementFailedLoginAttempts(user.id);

        // Check if should lock account
        if (user.failed_login_attempts + 1 >= ACCOUNT_LOCKOUT.maxFailedAttempts) {
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + ACCOUNT_LOCKOUT.lockoutDurationMinutes);
          await userRepository.lockAccount(user.id, lockUntil);

          // Log security event
          await auditRepository.log({
            org_id: orgId,
            user_id: user.id,
            action: AUDIT_ACTIONS.LOGIN_FAILED_ACCOUNT_LOCKED,
            status: 'warning'
          });

          throw new AuthenticationError('ACCOUNT_LOCKED', 
            `Account locked for ${ACCOUNT_LOCKOUT.lockoutDurationMinutes} minutes due to failed login attempts`
          );
        }

        throw new AuthenticationError('INVALID_CREDENTIALS', 'Email or password is incorrect');
      }

      // 5. Generate tokens
      const accessToken = tokenService.generateAccessToken(user.id);
      const refreshToken = await tokenService.generateRefreshToken(user.id, orgId);

      // 6. Update login timestamp and reset failed attempts
      await userRepository.recordSuccessfulLogin(user.id);

      // 7. Log successful login
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        status: 'success'
      });

      logger.info('User logged in successfully', { user_id: user.id, email });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 900,
        token_type: 'Bearer',
        user: {
          user_id: user.id,
          email: user.email,
          role: user.role,
          org_id: user.org_id
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async signup(email, password, orgId) {
    try {
      // 1. Check if user already exists
      const existingUser = await userRepository.findByEmailAndOrg(email, orgId);

      if (existingUser) {
        logger.warn('Signup attempt with duplicate email', { email, org_id: orgId });
        throw new ValidationError('DUPLICATE_EMAIL', 'Email already exists in this organization');
      }

      // 2. Validate password
      cryptoService.validatePassword(password);

      // 3. Hash password
      const passwordHash = await cryptoService.hashPassword(password);

      // 4. Create user
      const user = await userRepository.create({
        org_id: orgId,
        email,
        password_hash: passwordHash,
        role: 'user'
      });

      // 5. Log signup
      await auditRepository.log({
        org_id: orgId,
        user_id: user.id,
        action: AUDIT_ACTIONS.USER_SIGNUP,
        status: 'success'
      });

      logger.info('User signed up', { user_id: user.id, email });

      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        org_id: user.org_id
      };
    } catch (error) {
      throw error;
    }
  }

  async refreshAccessToken(refreshToken, orgId) {
    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);

      // Check if token is revoked
      const tokenExists = await tokenRepository.findByTokenId(payload.token_id);

      if (!tokenExists || tokenExists.is_revoked) {
        logger.warn('Token reuse detected', { user_id: payload.user_id, org_id: orgId });
        
        // Log security event
        await auditRepository.log({
          org_id: orgId,
          user_id: payload.user_id,
          action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
          status: 'warning'
        });

        throw new AuthenticationError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked');
      }

      // Generate new tokens
      const newAccessToken = tokenService.generateAccessToken(payload.user_id);
      const newRefreshToken = await tokenService.generateRefreshToken(payload.user_id, orgId);

      // Revoke old refresh token
      await tokenRepository.revokeToken(payload.token_id);

      // Log token refresh
      await auditRepository.log({
        org_id: orgId,
        user_id: payload.user_id,
        action: AUDIT_ACTIONS.TOKEN_REFRESH,
        status: 'success'
      });

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 900,
        token_type: 'Bearer'
      };
    } catch (error) {
      throw error;
    }
  }

  async logout(userId, refreshToken) {
    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);

      if (payload.user_id !== userId) {
        throw new ValidationError('TOKEN_MISMATCH', 'Token does not match user');
      }

      // Revoke refresh token
      await tokenRepository.revokeToken(payload.token_id);

      // Log logout
      await auditRepository.log({
        user_id: userId,
        action: AUDIT_ACTIONS.LOGOUT,
        status: 'success'
      });

      logger.info('User logged out', { user_id: userId });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AuthService();
