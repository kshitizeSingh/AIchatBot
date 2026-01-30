const { successResponse, errorResponse } = require('../utils/responses');
const userService = require('../services/userService');
const { validateUserCreation, validateRoleUpdate } = require('../validators/userValidator');
const { AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserController {
  async createUser(req, res, next) {
    try {
      // Check permission
      if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only admin can create users')
        );
      }

      const { error, value } = validateUserCreation(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await userService.createUser(
        value.email,
        value.password,
        value.role,
        req.user.org_id,
        req.user.user_id
      );

      return res.status(201).json(
        successResponse(result, 'User created successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async listUsers(req, res, next) {
    try {
      if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only admin can list users')
        );
      }

      const users = await userService.listOrgUsers(req.user.org_id);

      return res.status(200).json(
        successResponse(users, 'Users retrieved successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      if (req.user.role !== 'owner') {
        return res.status(403).json(
          errorResponse('INSUFFICIENT_PERMISSION', 'Only owner can change roles')
        );
      }

      const { error, value } = validateRoleUpdate(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await userService.updateUserRole(
        req.params.id,
        value.role,
        req.user.org_id,
        req.user.user_id
      );

      return res.status(200).json(
        successResponse(result, 'User role updated successfully')
      );
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await userService.getUserById(req.user.user_id, req.user.org_id);

      return res.status(200).json(
        successResponse(user, 'User profile retrieved')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
