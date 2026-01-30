const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const { PASSWORD_REQUIREMENTS } = require('../utils/constants');

// Password validation schema
const passwordSchema = Joi.string()
  .min(PASSWORD_REQUIREMENTS.MIN_LENGTH)
  .max(PASSWORD_REQUIREMENTS.MAX_LENGTH)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).*$/)
  .required()
  .messages({
    'string.min': `Password must be at least ${PASSWORD_REQUIREMENTS.MIN_LENGTH} characters long`,
    'string.max': `Password must not exceed ${PASSWORD_REQUIREMENTS.MAX_LENGTH} characters`,
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    'any.required': 'Password is required'
  });

// Email validation schema
const emailSchema = Joi.string()
  .email({ tlds: { allow: false } })
  .max(255)
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'string.max': 'Email address must not exceed 255 characters',
    'any.required': 'Email address is required'
  });

// Organization ID validation schema
const orgIdSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.guid': 'Organization ID must be a valid UUID',
    'any.required': 'Organization ID is required'
  });

// User ID validation schema
const userIdSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.guid': 'User ID must be a valid UUID',
    'any.required': 'User ID is required'
  });

/**
 * Validate login request
 */
const validateLogin = (data) => {
  const schema = Joi.object({
    email: emailSchema,
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
      'string.empty': 'Password cannot be empty'
    }),
    remember_me: Joi.boolean().optional().default(false)
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Login validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate signup request
 */
const validateSignup = (data) => {
  const schema = Joi.object({
    email: emailSchema,
    password: passwordSchema,
    confirm_password: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Password confirmation is required'
      }),
    first_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s]+$/)
      .optional()
      .messages({
        'string.min': 'First name must be at least 2 characters long',
        'string.max': 'First name must not exceed 50 characters',
        'string.pattern.base': 'First name can only contain letters and spaces'
      }),
    last_name: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z\s]+$/)
      .optional()
      .messages({
        'string.min': 'Last name must be at least 2 characters long',
        'string.max': 'Last name must not exceed 50 characters',
        'string.pattern.base': 'Last name can only contain letters and spaces'
      }),
    terms_accepted: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'You must accept the terms and conditions',
        'any.required': 'Terms acceptance is required'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Signup validation failed', {
      violations: details
    });
  }

  // Remove confirm_password from the validated data
  delete value.confirm_password;
  return value;
};

/**
 * Validate refresh token request
 */
const validateRefreshToken = (data) => {
  const schema = Joi.object({
    refresh_token: Joi.string()
      .required()
      .messages({
        'any.required': 'Refresh token is required',
        'string.empty': 'Refresh token cannot be empty'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Refresh token validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate logout request
 */
const validateLogout = (data) => {
  const schema = Joi.object({
    refresh_token: Joi.string()
      .optional()
      .messages({
        'string.empty': 'Refresh token cannot be empty if provided'
      }),
    logout_all_devices: Joi.boolean()
      .optional()
      .default(false)
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Logout validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate password reset request
 */
const validatePasswordResetRequest = (data) => {
  const schema = Joi.object({
    email: emailSchema
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Password reset request validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate password reset confirmation
 */
const validatePasswordReset = (data) => {
  const schema = Joi.object({
    token: Joi.string()
      .required()
      .messages({
        'any.required': 'Reset token is required',
        'string.empty': 'Reset token cannot be empty'
      }),
    password: passwordSchema,
    confirm_password: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Password confirmation is required'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Password reset validation failed', {
      violations: details
    });
  }

  // Remove confirm_password from the validated data
  delete value.confirm_password;
  return value;
};

/**
 * Validate password change request
 */
const validatePasswordChange = (data) => {
  const schema = Joi.object({
    current_password: Joi.string()
      .required()
      .messages({
        'any.required': 'Current password is required',
        'string.empty': 'Current password cannot be empty'
      }),
    new_password: passwordSchema,
    confirm_password: Joi.string()
      .valid(Joi.ref('new_password'))
      .required()
      .messages({
        'any.only': 'New passwords do not match',
        'any.required': 'Password confirmation is required'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Password change validation failed', {
      violations: details
    });
  }

  // Remove confirm_password from the validated data
  delete value.confirm_password;
  return value;
};

/**
 * Validate email verification request
 */
const validateEmailVerification = (data) => {
  const schema = Joi.object({
    token: Joi.string()
      .required()
      .messages({
        'any.required': 'Verification token is required',
        'string.empty': 'Verification token cannot be empty'
      })
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Email verification validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate resend verification email request
 */
const validateResendVerification = (data) => {
  const schema = Joi.object({
    email: emailSchema
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Resend verification validation failed', {
      violations: details
    });
  }

  return value;
};

/**
 * Validate HMAC headers
 */
const validateHMACHeaders = (headers) => {
  const schema = Joi.object({
    'x-client-id': Joi.string()
      .required()
      .messages({
        'any.required': 'X-Client-ID header is required',
        'string.empty': 'X-Client-ID header cannot be empty'
      }),
    'x-timestamp': Joi.string()
      .pattern(/^\d+$/)
      .required()
      .messages({
        'any.required': 'X-Timestamp header is required',
        'string.pattern.base': 'X-Timestamp must be a valid timestamp',
        'string.empty': 'X-Timestamp header cannot be empty'
      }),
    'x-signature': Joi.string()
      .required()
      .messages({
        'any.required': 'X-Signature header is required',
        'string.empty': 'X-Signature header cannot be empty'
      })
  }).unknown(true); // Allow other headers

  const { error, value } = schema.validate(headers, {
    abortEarly: false
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'HMAC headers validation failed', {
      violations: details
    });
  }

  return {
    clientId: value['x-client-id'],
    timestamp: value['x-timestamp'],
    signature: value['x-signature']
  };
};

/**
 * Validate pagination parameters
 */
const validatePagination = (query) => {
  const schema = Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.integer': 'Page must be an integer',
        'number.min': 'Page must be at least 1'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),
    sort_by: Joi.string()
      .valid('created_at', 'updated_at', 'email', 'name')
      .default('created_at')
      .messages({
        'any.only': 'Sort by must be one of: created_at, updated_at, email, name'
      }),
    sort_order: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .messages({
        'any.only': 'Sort order must be either asc or desc'
      })
  });

  const { error, value } = schema.validate(query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message);
    throw new ValidationError('VALIDATION_FAILED', 'Pagination validation failed', {
      violations: details
    });
  }

  // Calculate offset from page and limit
  value.offset = (value.page - 1) * value.limit;
  
  return value;
};

module.exports = {
  validateLogin,
  validateSignup,
  validateRefreshToken,
  validateLogout,
  validatePasswordResetRequest,
  validatePasswordReset,
  validatePasswordChange,
  validateEmailVerification,
  validateResendVerification,
  validateHMACHeaders,
  validatePagination,
  
  // Export schemas for reuse
  schemas: {
    email: emailSchema,
    password: passwordSchema,
    orgId: orgIdSchema,
    userId: userIdSchema
  }
};