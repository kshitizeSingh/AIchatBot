const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const { schemas } = require('./authValidator');

/**
 * Validate organization registration request
 */
const validateOrgRegistration = (data) => {
  const schema = Joi.object({
    org_name: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_.&]+$/)
      .required()
      .messages({
        'string.min': 'Organization name must be at least 2 characters long',
        'string.max': 'Organization name must not exceed 100 characters',
        'string.pattern.base': 'Organization name can only contain letters, numbers, spaces, hyphens, underscores, dots, and ampersands',
        'any.required': 'Organization name is required'
      }),
    admin_email: schemas.email,
    admin_password: schemas.password,
    confirm_password: Joi.string()
      .valid(Joi.ref('admin_password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Password confirmation is required'
      }),
    industry: Joi.string()
      .valid(
        'technology', 'healthcare', 'finance', 'education', 'retail',
        'manufacturing', 'consulting', 'media', 'government', 'nonprofit',
        'other'
      )
      .optional()
      .messages({
        'any.only': 'Please select a valid industry'
      }),
    company_size: Joi.string()
      .valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')
      .optional()
      .messages({
        'any.only': 'Please select a valid company size range'
      }),
    country: Joi.string()
      .min(2)
      .max(2)
      .pattern(/^[A-Z]{2}$/)
      .optional()
      .messages({
        'string.min': 'Country code must be 2 characters',
        'string.max': 'Country code must be 2 characters',
        'string.pattern.base': 'Country code must be in ISO 3166-1 alpha-2 format (e.g., US, GB)'
      }),
    timezone: Joi.string()
      .optional()
      .messages({
        'string.base': 'Timezone must be a valid timezone string'
      }),
    terms_accepted: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'You must accept the terms and conditions',
        'any.required': 'Terms acceptance is required'
      }),
    privacy_accepted: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'You must accept the privacy policy',
        'any.required': 'Privacy policy acceptance is required'
      }),
    marketing_consent: Joi.boolean()
      .optional()
      .default(false)
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization registration validation failed', {
      violations: details
    });
  }

  // Remove confirm_password from the validated data
  delete value.confirm_password;
  return value;
};

/**
 * Validate organization update request
 */
const validateOrgUpdate = (data) => {
  const schema = Joi.object({
    org_name: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_.&]+$/)
      .optional()
      .messages({
        'string.min': 'Organization name must be at least 2 characters long',
        'string.max': 'Organization name must not exceed 100 characters',
        'string.pattern.base': 'Organization name can only contain letters, numbers, spaces, hyphens, underscores, dots, and ampersands'
      }),
    industry: Joi.string()
      .valid(
        'technology', 'healthcare', 'finance', 'education', 'retail',
        'manufacturing', 'consulting', 'media', 'government', 'nonprofit',
        'other'
      )
      .optional()
      .messages({
        'any.only': 'Please select a valid industry'
      }),
    company_size: Joi.string()
      .valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')
      .optional()
      .messages({
        'any.only': 'Please select a valid company size range'
      }),
    country: Joi.string()
      .min(2)
      .max(2)
      .pattern(/^[A-Z]{2}$/)
      .optional()
      .messages({
        'string.min': 'Country code must be 2 characters',
        'string.max': 'Country code must be 2 characters',
        'string.pattern.base': 'Country code must be in ISO 3166-1 alpha-2 format (e.g., US, GB)'
      }),
    timezone: Joi.string()
      .optional()
      .messages({
        'string.base': 'Timezone must be a valid timezone string'
      }),
    website: Joi.string()
      .uri()
      .optional()
      .messages({
        'string.uri': 'Website must be a valid URL'
      }),
    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Description must not exceed 500 characters'
      })
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization update validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate organization settings update
 */
const validateOrgSettings = (data) => {
  const schema = Joi.object({
    security_settings: Joi.object({
      password_policy: Joi.object({
        min_length: Joi.number().integer().min(8).max(128).optional(),
        require_uppercase: Joi.boolean().optional(),
        require_lowercase: Joi.boolean().optional(),
        require_numbers: Joi.boolean().optional(),
        require_special_chars: Joi.boolean().optional(),
        password_expiry_days: Joi.number().integer().min(0).max(365).optional()
      }).optional(),
      session_settings: Joi.object({
        session_timeout_minutes: Joi.number().integer().min(5).max(1440).optional(),
        max_concurrent_sessions: Joi.number().integer().min(1).max(10).optional(),
        require_2fa: Joi.boolean().optional()
      }).optional(),
      login_settings: Joi.object({
        max_login_attempts: Joi.number().integer().min(3).max(10).optional(),
        lockout_duration_minutes: Joi.number().integer().min(5).max(1440).optional(),
        allow_password_reset: Joi.boolean().optional()
      }).optional()
    }).optional(),
    notification_settings: Joi.object({
      email_notifications: Joi.boolean().optional(),
      security_alerts: Joi.boolean().optional(),
      login_notifications: Joi.boolean().optional(),
      weekly_reports: Joi.boolean().optional()
    }).optional(),
    feature_flags: Joi.object({
      enable_api_access: Joi.boolean().optional(),
      enable_webhooks: Joi.boolean().optional(),
      enable_audit_logs: Joi.boolean().optional(),
      enable_sso: Joi.boolean().optional()
    }).optional()
  }).min(1).messages({
    'object.min': 'At least one setting must be provided for update'
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization settings validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate organization status change
 */
const validateOrgStatusChange = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid('active', 'inactive', 'suspended')
      .required()
      .messages({
        'any.only': 'Status must be one of: active, inactive, suspended',
        'any.required': 'Status is required'
      }),
    reason: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Reason must not exceed 500 characters'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization status change validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate client credentials regeneration request
 */
const validateCredentialsRegeneration = (data) => {
  const schema = Joi.object({
    confirmation: Joi.string()
      .valid('REGENERATE_CREDENTIALS')
      .required()
      .messages({
        'any.only': 'You must confirm credentials regeneration by providing the exact confirmation string',
        'any.required': 'Confirmation is required'
      }),
    reason: Joi.string()
      .max(200)
      .optional()
      .messages({
        'string.max': 'Reason must not exceed 200 characters'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Credentials regeneration validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate organization search parameters
 */
const validateOrgSearch = (query) => {
  const schema = Joi.object({
    q: Joi.string()
      .min(2)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Search query must be at least 2 characters long',
        'string.max': 'Search query must not exceed 100 characters'
      }),
    industry: Joi.string()
      .valid(
        'technology', 'healthcare', 'finance', 'education', 'retail',
        'manufacturing', 'consulting', 'media', 'government', 'nonprofit',
        'other'
      )
      .optional(),
    company_size: Joi.string()
      .valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')
      .optional(),
    country: Joi.string()
      .min(2)
      .max(2)
      .pattern(/^[A-Z]{2}$/)
      .optional(),
    status: Joi.string()
      .valid('active', 'inactive', 'suspended')
      .optional(),
    created_after: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Created after date must be in ISO format'
      }),
    created_before: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Created before date must be in ISO format'
      })
  });

  const { error, value } = schema.validate(query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization search validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate organization invitation request
 */
const validateOrgInvitation = (data) => {
  const schema = Joi.object({
    email: schemas.email,
    role: Joi.string()
      .valid('admin', 'user')
      .default('user')
      .messages({
        'any.only': 'Role must be either admin or user'
      }),
    message: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Invitation message must not exceed 500 characters'
      }),
    expires_in_days: Joi.number()
      .integer()
      .min(1)
      .max(30)
      .default(7)
      .messages({
        'number.base': 'Expiration days must be a number',
        'number.integer': 'Expiration days must be an integer',
        'number.min': 'Invitation must expire in at least 1 day',
        'number.max': 'Invitation cannot expire in more than 30 days'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Organization invitation validation failed', {
      violations: details
    });
  }

  return value;
};

module.exports = {
  validateOrgRegistration,
  validateOrgUpdate,
  validateOrgSettings,
  validateOrgStatusChange,
  validateCredentialsRegeneration,
  validateOrgSearch,
  validateOrgInvitation
};