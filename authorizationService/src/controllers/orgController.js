const { successResponse, errorResponse } = require('../utils/responses');
const orgService = require('../services/orgService');
const { validateOrgRegistration } = require('../validators/orgValidator');
const logger = require('../utils/logger');

class OrgController {
  async register(req, res, next) {
    try {
      const { error, value } = validateOrgRegistration(req.body);
      if (error) {
        return res.status(400).json(
          errorResponse('VALIDATION_ERROR', error.details[0].message)
        );
      }

      const result = await orgService.registerOrganization(
        value.org_name,
        value.admin_email,
        value.admin_password
      );

      return res.status(201).json(
        successResponse(result, 'Organization registered successfully. Save client_secret immediately!')
      );
    } catch (error) {
      next(error);
    }
  }

  async getDetails(req, res, next) {
    try {
      const details = await orgService.getOrgDetails(req.org_id);

      return res.status(200).json(
        successResponse(details, 'Organization details retrieved')
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrgController();
