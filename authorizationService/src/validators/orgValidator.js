const Joi = require('joi');

const validateOrgRegistration = (body) => {
  const schema = Joi.object({
    org_name: Joi.string()
      .min(3)
      .max(255)
      .required()
      .messages({
        'string.min': 'Organization name must be at least 3 characters',
        'string.max': 'Organization name cannot exceed 255 characters',
        'any.required': 'Organization name is required'
      }),
    admin_email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Invalid email format',
        'any.required': 'Admin email is required'
      }),
    admin_password: Joi.string()
      .min(8)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'any.required': 'Admin password is required'
      })
  });

  return schema.validate(body, { abortEarly: false });
};

module.exports = {
  validateOrgRegistration
};
