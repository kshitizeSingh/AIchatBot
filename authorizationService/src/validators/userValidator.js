const Joi = require('joi');
const { VALID_ROLES } = require('../utils/constants');

const validateUserCreation = (body) => {
  const schema = Joi.object({
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Invalid email format',
        'any.required': 'Email is required'
      }),
    password: Joi.string()
      .min(8)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'any.required': 'Password is required'
      }),
    role: Joi.string()
      .valid(...VALID_ROLES)
      .default('user')
      .messages({
        'any.only': `Role must be one of: ${VALID_ROLES.join(', ')}`
      })
  });

  return schema.validate(body, { abortEarly: false });
};

const validateRoleUpdate = (body) => {
  const schema = Joi.object({
    role: Joi.string()
      .valid(...VALID_ROLES)
      .required()
      .messages({
        'any.only': `Role must be one of: ${VALID_ROLES.join(', ')}`,
        'any.required': 'Role is required'
      })
  });

  return schema.validate(body, { abortEarly: false });
};

module.exports = {
  validateUserCreation,
  validateRoleUpdate
};
