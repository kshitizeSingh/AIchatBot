const Joi = require('joi');

const validateLogin = (body) => {
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
      })
  });

  return schema.validate(body, { abortEarly: false });
};

const validateSignup = (body) => {
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
      })
  });

  return schema.validate(body, { abortEarly: false });
};

const validateRefreshToken = (body) => {
  const schema = Joi.object({
    refresh_token: Joi.string()
      .required()
      .messages({
        'any.required': 'refresh_token is required'
      })
  });

  return schema.validate(body, { abortEarly: false });
};

module.exports = {
  validateLogin,
  validateSignup,
  validateRefreshToken
};
