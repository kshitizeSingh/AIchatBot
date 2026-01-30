const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI FAQ Platform - Auth Service API',
      version: '1.0.0',
      description: 'Complete authentication and authorization service for multi-tenant FAQ platform',
      contact: {
        name: 'Development Team',
        email: 'dev@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development Server'
      },
      {
        url: 'https://api.example.com',
        description: 'Production Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token in Authorization header'
        },
        HMACAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Signature',
          description: 'HMAC-SHA256 signature'
        }
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            password: {
              type: 'string',
              minLength: 12,
              example: 'SecurePassword123!'
            }
          }
        },
        SignupRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'newuser@example.com'
            },
            password: {
              type: 'string',
              minLength: 12,
              example: 'SecurePassword123!'
            }
          }
        },
        OrgRegistrationRequest: {
          type: 'object',
          required: ['org_name', 'admin_email', 'admin_password'],
          properties: {
            org_name: {
              type: 'string',
              example: 'Acme Corporation'
            },
            admin_email: {
              type: 'string',
              format: 'email',
              example: 'admin@acme.com'
            },
            admin_password: {
              type: 'string',
              minLength: 12,
              example: 'AdminPassword123!'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            access_token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            refresh_token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            expires_in: {
              type: 'integer',
              example: 900
            },
            token_type: {
              type: 'string',
              example: 'Bearer'
            },
            user: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  format: 'uuid',
                  example: '123e4567-e89b-12d3-a456-426614174000'
                },
                email: {
                  type: 'string',
                  example: 'user@example.com'
                },
                role: {
                  type: 'string',
                  enum: ['owner', 'admin', 'user'],
                  example: 'user'
                },
                org_id: {
                  type: 'string',
                  format: 'uuid',
                  example: '123e4567-e89b-12d3-a456-426614174001'
                }
              }
            }
          }
        },
        OrgRegistrationResponse: {
          type: 'object',
          properties: {
            org_id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174001'
            },
            org_name: {
              type: 'string',
              example: 'Acme Corporation'
            },
            client_id: {
              type: 'string',
              example: 'pk_abc123def456ghi789jkl012mno345pqr'
            },
            client_secret: {
              type: 'string',
              example: 'sk_xyz987wvu654tsr321qpo098nml765kji432hgf210edc109baz876yxw'
            },
            admin_user: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  format: 'uuid'
                },
                email: {
                  type: 'string'
                },
                role: {
                  type: 'string',
                  enum: ['owner']
                }
              }
            },
            warning: {
              type: 'string',
              example: 'Save client_secret now. It cannot be retrieved later.'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['success'],
              example: 'success'
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully'
            },
            data: {
              type: 'object'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2023-12-01T10:30:00.000Z'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['error'],
              example: 'error'
            },
            error_code: {
              type: 'string',
              example: 'VALIDATION_ERROR'
            },
            message: {
              type: 'string',
              example: 'Invalid input provided'
            },
            details: {
              type: 'object',
              example: {}
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2023-12-01T10:30:00.000Z'
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'] // paths to files containing OpenAPI definitions
};

const specs = swaggerJsDoc(options);

module.exports = {
  swaggerUi,
  specs
};