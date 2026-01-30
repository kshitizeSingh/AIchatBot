const { successResponse, errorResponse } = require('../utils/responses');
const authService = require('../services/authService');
const { validateLogin, validateSignup, validateRefreshToken } = require('../validators/authValidator');
const logger = require('../utils/logger');

class AuthController {
  async login(req, res, next) {
    try {
      const { error, value } = validateLogin(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await authService.login(value.email, value.password, req.org_id);

      return res.status(200).json(
        successResponse(result, 'User logged in successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async signup(req, res, next) {
    try {
      const { error, value } = validateSignup(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await authService.signup(value.email, value.password, req.org_id);

      return res.status(201).json(
        successResponse(result, 'User registered successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const { error, value } = validateRefreshToken(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await authService.refreshAccessToken(value.refresh_token, req.org_id);

      return res.status(200).json(
        successResponse(result, 'Token refreshed successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      if (!req.body.refresh_token) {
        return res.status(400).json(
          errorResponse('MISSING_REQUIRED_FIELD', 'refresh_token is required')
        );
      }

      await authService.logout(req.user.user_id, req.body.refresh_token);

      return res.status(200).json(
        successResponse({}, 'Logged out successfully')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
