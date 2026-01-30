const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const { schemas } = require('./authValidator');

/**
 * Validate user creation request (by admin)
 */
const validateUserCreation = (data) => {
  const schema = Joi.object({
    email: schemas.email,
    password: schemas.password,
    confirm_password: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Password confirmation is required'
      }),
    role: Joi.string()
      .valid('owner', 'admin', 'user')
      .default('user')
      .messages({
        'any.only': 'Role must be one of: owner, admin, user'
      }),
    first_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s\-']+$/)
      .optional()
      .messages({
        'string.min': 'First name must be at least 2 characters long',
        'string.max': 'First name must not exceed 50 characters',
        'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes'
      }),
    last_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s\-']+$/)
      .optional()
      .messages({
        'string.min': 'Last name must be at least 2 characters long',
        'string.max': 'Last name must not exceed 50 characters',
        'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes'
      }),
    department: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Department must not exceed 100 characters'
      }),
    job_title: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Job title must not exceed 100 characters'
      }),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Phone number must be in valid international format'
      }),
    is_active: Joi.boolean()
      .default(true)
      .optional(),
    send_welcome_email: Joi.boolean()
      .default(true)
      .optional()
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'User creation validation failed', {
      violations: details
    });
  }

  // Remove confirm_password from the validated data
  delete value.confirm_password;
  return value;
};

/**
 * Validate user update request
 */
const validateUserUpdate = (data) => {
  const schema = Joi.object({
    email: schemas.email.optional(),
    first_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s\-']+$/)
      .optional()
      .messages({
        'string.min': 'First name must be at least 2 characters long',
        'string.max': 'First name must not exceed 50 characters',
        'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes'
      }),
    last_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s\-']+$/)
      .optional()
      .messages({
        'string.min': 'Last name must be at least 2 characters long',
        'string.max': 'Last name must not exceed 50 characters',
        'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes'
      }),
    department: Joi.string()
      .max(100)
      .allow('')
      .optional()
      .messages({
        'string.max': 'Department must not exceed 100 characters'
      }),
    job_title: Joi.string()
      .max(100)
      .allow('')
      .optional()
      .messages({
        'string.max': 'Job title must not exceed 100 characters'
      }),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .allow('')
      .optional()
      .messages({
        'string.pattern.base': 'Phone number must be in valid international format'
      }),
    timezone: Joi.string()
      .optional()
      .messages({
        'string.base': 'Timezone must be a valid timezone string'
      }),
    language: Joi.string()
      .valid('en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko')
      .optional()
      .messages({
        'any.only': 'Language must be a supported language code'
      }),
    notification_preferences: Joi.object({
      email_notifications: Joi.boolean().optional(),
      push_notifications: Joi.boolean().optional(),
      security_alerts: Joi.boolean().optional(),
      marketing_emails: Joi.boolean().optional()
    }).optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'User update validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate role update request
 */
const validateRoleUpdate = (data) => {
  const schema = Joi.object({
    role: Joi.string()
      .valid('owner', 'admin', 'user')
      .required()
      .messages({
        'any.only': 'Role must be one of: owner, admin, user',
        'any.required': 'Role is required'
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
    throw new ValidationError('VALIDATION_FAILED', 'Role update validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate user status change request
 */
const validateUserStatusChange = (data) => {
  const schema = Joi.object({
    is_active: Joi.boolean()
      .required()
      .messages({
        'any.required': 'Active status is required',
        'boolean.base': 'Active status must be true or false'
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
    throw new ValidationError('VALIDATION_FAILED', 'User status change validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate user search parameters
 */
const validateUserSearch = (query) => {
  const schema = Joi.object({
    q: Joi.string()
      .min(2)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Search query must be at least 2 characters long',
        'string.max': 'Search query must not exceed 100 characters'
      }),
    role: Joi.string()
      .valid('owner', 'admin', 'user')
      .optional(),
    department: Joi.string()
      .max(100)
      .optional(),
    is_active: Joi.boolean()
      .optional(),
    email_verified: Joi.boolean()
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
      }),
    last_login_after: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Last login after date must be in ISO format'
      }),
    last_login_before: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Last login before date must be in ISO format'
      })
  });

  const { error, value } = schema.validate(query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'User search validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate bulk user operation request
 */
const validateBulkUserOperation = (data) => {
  const schema = Joi.object({
    user_ids: Joi.array()
      .items(schemas.userId)
      .min(1)
      .max(100)
      .unique()
      .required()
      .messages({
        'array.min': 'At least one user ID must be provided',
        'array.max': 'Cannot perform bulk operation on more than 100 users at once',
        'array.unique': 'User IDs must be unique',
        'any.required': 'User IDs are required'
      }),
    operation: Joi.string()
      .valid('activate', 'deactivate', 'delete', 'update_role', 'send_email')
      .required()
      .messages({
        'any.only': 'Operation must be one of: activate, deactivate, delete, update_role, send_email',
        'any.required': 'Operation is required'
      }),
    parameters: Joi.object({
      role: Joi.string()
        .valid('owner', 'admin', 'user')
        .when('operation', {
          is: 'update_role',
          then: Joi.required(),
          otherwise: Joi.forbidden()
        }),
      email_template: Joi.string()
        .when('operation', {
          is: 'send_email',
          then: Joi.required(),
          otherwise: Joi.forbidden()
        }),
      reason: Joi.string()
        .max(200)
        .optional()
    }).optional(),
    confirmation: Joi.string()
      .when('operation', {
        is: 'delete',
        then: Joi.valid('DELETE_USERS').required(),
        otherwise: Joi.optional()
      })
      .messages({
        'any.only': 'You must confirm user deletion by providing the exact confirmation string'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Bulk user operation validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate user session management request
 */
const validateSessionManagement = (data) => {
  const schema = Joi.object({
    action: Joi.string()
      .valid('revoke_session', 'revoke_all_sessions', 'list_sessions')
      .required()
      .messages({
        'any.only': 'Action must be one of: revoke_session, revoke_all_sessions, list_sessions',
        'any.required': 'Action is required'
      }),
    session_id: Joi.string()
      .when('action', {
        is: 'revoke_session',
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
      .messages({
        'any.required': 'Session ID is required for revoking specific session'
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
    throw new ValidationError('VALIDATION_FAILED', 'Session management validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate user profile picture upload
 */
const validateProfilePicture = (data) => {
  const schema = Joi.object({
    file_type: Joi.string()
      .valid('image/jpeg', 'image/png', 'image/webp')
      .required()
      .messages({
        'any.only': 'File type must be JPEG, PNG, or WebP',
        'any.required': 'File type is required'
      }),
    file_size: Joi.number()
      .integer()
      .max(5 * 1024 * 1024) // 5MB
      .required()
      .messages({
        'number.max': 'File size must not exceed 5MB',
        'any.required': 'File size is required'
      }),
    file_name: Joi.string()
      .max(255)
      .required()
      .messages({
        'string.max': 'File name must not exceed 255 characters',
        'any.required': 'File name is required'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Profile picture validation failed', {
      violations: details
    });
  }

  return value;
};

module.exports = {
  validateUserCreation,
  validateUserUpdate,
  validateRoleUpdate,
  validateUserStatusChange,
  validateUserSearch,
  validateBulkUserOperation,
  validateSessionManagement,
  validateProfilePicture
};