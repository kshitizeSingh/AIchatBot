/**
 * Swagger/OpenAPI Configuration for Chat & Orchestration Service
 * 
 * This module configures the OpenAPI 3.0 specification for the AI FAQ Platform
 * Chat Service, including authentication schemes, common components, and
 * API documentation structure.
 */

const swaggerJSDoc = require('swagger-jsdoc');
const path = require('path');
const config = require('./index');

// OpenAPI 3.0 specification definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AI FAQ Platform - Chat & Orchestration Service',
    version: '1.1.0',
    description: `
      The Chat & Orchestration Service is the runtime brain of the AI FAQ Platform.
      It provides RAG-powered conversational AI capabilities with multi-tenant isolation,
      conversation management, and real-time streaming responses.
      
      ## Features
      - RAG (Retrieval-Augmented Generation) pipeline
      - Multi-turn conversation support
      - Real-time streaming responses via SSE
      - Multi-tenant data isolation
      - Comprehensive authentication (JWT + HMAC)
      - Conversation history management
      
      ## Authentication
      This API uses a dual authentication scheme:
      1. **JWT Bearer Token** - For user identity and authorization
      2. **HMAC Signature** - For request integrity and organization verification
      
      Both authentication methods are required for all protected endpoints.
    `,
    contact: {
      name: 'Platform Team',
      email: 'platform@company.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: `http://localhost:${config.PORT || 3003}`,
      description: 'Development server'
    },
    {
      url: 'http://chat-service:3003',
      description: 'Docker container server'
    },
    {
      url: 'https://api.aifaq.company.com/chat',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token for user authentication and authorization'
      },
      HMACAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Signature',
        description: 'HMAC-SHA256 signature for request integrity verification'
      }
    },
    parameters: {
      ClientId: {
        name: 'X-Client-ID',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          pattern: '^pk_[a-f0-9]{32}$',
          example: 'pk_7f83efb20c8e4b14bd6a239c2f997f41'
        },
        description: 'Organization client ID for HMAC authentication'
      },
      Timestamp: {
        name: 'X-Timestamp',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          pattern: '^[0-9]{13}$',
          example: '1738459200000'
        },
        description: 'Unix timestamp in milliseconds (must be within ±5 minutes of server time)'
      },
      Signature: {
        name: 'X-Signature',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
          example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
        },
        description: 'HMAC-SHA256 hex digest of the request payload'
      },
      ConversationId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
          example: '550e8400-e29b-41d4-a716-446655440000'
        },
        description: 'Unique conversation identifier'
      },
      PaginationLimit: {
        name: 'limit',
        in: 'query',
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20
        },
        description: 'Maximum number of items to return'
      },
      PaginationOffset: {
        name: 'offset',
        in: 'query',
        schema: {
          type: 'integer',
          minimum: 0,
          default: 0
        },
        description: 'Number of items to skip for pagination'
      }
    },
    schemas: {
      // Error Response Schemas
      ErrorResponse: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            description: 'Error code for programmatic handling',
            example: 'INVALID_REQUEST'
          },
          message: {
            type: 'string',
            description: 'Human-readable error message',
            example: 'The request is invalid or malformed'
          },
          details: {
            type: 'object',
            description: 'Additional error context (optional)',
            additionalProperties: true
          }
        }
      },
      
      // Authentication Error Codes
      AuthErrorCodes: {
        type: 'string',
        enum: [
          'MISSING_AUTH_HEADER',
          'MISSING_HMAC_HEADERS',
          'HMAC_TIMESTAMP_EXPIRED',
          'EXPIRED_TOKEN',
          'INVALID_TOKEN',
          'INVALID_CLIENT_ID',
          'INVALID_SIGNATURE',
          'ORG_MISMATCH',
          'AUTH_SERVICE_UNAVAILABLE'
        ],
        description: 'Possible authentication error codes'
      },
      
      // Chat Query Schemas
      ChatQueryRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            maxLength: 2000,
            description: 'User question or message',
            example: 'How do I reset my password?'
          },
          conversation_id: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Existing conversation ID (null for new conversation)',
            example: '550e8400-e29b-41d4-a716-446655440000'
          },
          options: {
            type: 'object',
            description: 'Optional query parameters',
            properties: {
              top_k: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                default: 5,
                description: 'Number of relevant passages to retrieve'
              },
              min_score: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 0.3,
                description: 'Minimum similarity score for passage inclusion'
              },
              document_id: {
                type: 'string',
                format: 'uuid',
                nullable: true,
                description: 'Restrict search to specific document'
              },
              temperature: {
                type: 'number',
                minimum: 0,
                maximum: 2,
                default: 0.7,
                description: 'Response creativity (0=deterministic, 2=very creative)'
              },
              max_tokens: {
                type: 'integer',
                minimum: 50,
                maximum: 4096,
                default: 1024,
                description: 'Maximum response length in tokens'
              },
              stream: {
                type: 'boolean',
                default: false,
                description: 'Enable real-time streaming response via SSE'
              }
            }
          }
        }
      },
      
      ChatQueryResponse: {
        type: 'object',
        required: ['conversation_id', 'message_id', 'answer', 'sources', 'usage', 'duration_ms'],
        properties: {
          conversation_id: {
            type: 'string',
            format: 'uuid',
            description: 'Conversation identifier',
            example: '550e8400-e29b-41d4-a716-446655440000'
          },
          message_id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique message identifier',
            example: '7c9e6679-7425-40de-944b-e07fc1f90ae7'
          },
          answer: {
            type: 'string',
            description: 'AI-generated response',
            example: 'To reset your password, go to Settings → Security and click "Reset Password". You will receive an email with reset instructions.'
          },
          sources: {
            type: 'array',
            description: 'Knowledge base passages used for answer generation',
            items: {
              $ref: '#/components/schemas/Source'
            }
          },
          usage: {
            $ref: '#/components/schemas/TokenUsage'
          },
          duration_ms: {
            type: 'integer',
            description: 'Total processing time in milliseconds',
            example: 1842
          }
        }
      },
      
      Source: {
        type: 'object',
        required: ['filename', 'document_id', 'chunk_index', 'score'],
        properties: {
          filename: {
            type: 'string',
            description: 'Source document filename',
            example: 'user-guide.pdf'
          },
          document_id: {
            type: 'string',
            format: 'uuid',
            description: 'Document identifier',
            example: 'doc-550e8400-e29b-41d4-a716-446655440000'
          },
          chunk_index: {
            type: 'integer',
            minimum: 0,
            description: 'Chunk position within document',
            example: 2
          },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Similarity score (cosine similarity)',
            example: 0.91
          }
        }
      },
      
      TokenUsage: {
        type: 'object',
        required: ['model', 'prompt_tokens', 'completion_tokens'],
        properties: {
          model: {
            type: 'string',
            description: 'AI model used for generation',
            example: 'llama3'
          },
          prompt_tokens: {
            type: 'integer',
            description: 'Tokens used in prompt',
            example: 320
          },
          completion_tokens: {
            type: 'integer',
            description: 'Tokens generated in response',
            example: 87
          }
        }
      },
      
      // Conversation Schemas
      Conversation: {
        type: 'object',
        required: ['id', 'title', 'created_at', 'updated_at'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique conversation identifier',
            example: '550e8400-e29b-41d4-a716-446655440000'
          },
          title: {
            type: 'string',
            nullable: true,
            description: 'Conversation title (auto-generated or user-defined)',
            example: 'Password reset help'
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Conversation creation timestamp',
            example: '2026-02-22T10:00:00Z'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last message timestamp',
            example: '2026-02-22T10:05:00Z'
          },
          last_message: {
            type: 'string',
            nullable: true,
            description: 'Preview of the most recent message',
            example: 'To reset your password...'
          }
        }
      },
      
      ConversationList: {
        type: 'object',
        required: ['conversations', 'pagination'],
        properties: {
          conversations: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Conversation'
            }
          },
          pagination: {
            $ref: '#/components/schemas/Pagination'
          }
        }
      },
      
      Message: {
        type: 'object',
        required: ['id', 'role', 'content', 'created_at'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique message identifier',
            example: '7c9e6679-7425-40de-944b-e07fc1f90ae7'
          },
          role: {
            type: 'string',
            enum: ['user', 'assistant', 'system'],
            description: 'Message sender role',
            example: 'user'
          },
          content: {
            type: 'string',
            description: 'Message text content',
            example: 'How do I reset my password?'
          },
          sources: {
            type: 'array',
            description: 'Knowledge sources (assistant messages only)',
            items: {
              $ref: '#/components/schemas/Source'
            }
          },
          model: {
            type: 'string',
            nullable: true,
            description: 'AI model used (assistant messages only)',
            example: 'llama3'
          },
          tokens_used: {
            type: 'integer',
            nullable: true,
            description: 'Token count (assistant messages only)',
            example: 87
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Message timestamp',
            example: '2026-02-22T10:00:00Z'
          }
        }
      },
      
      MessageList: {
        type: 'object',
        required: ['conversation_id', 'messages', 'total'],
        properties: {
          conversation_id: {
            type: 'string',
            format: 'uuid',
            description: 'Conversation identifier',
            example: '550e8400-e29b-41d4-a716-446655440000'
          },
          messages: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Message'
            }
          },
          total: {
            type: 'integer',
            description: 'Total message count in conversation',
            example: 2
          }
        }
      },
      
      Pagination: {
        type: 'object',
        required: ['total', 'limit', 'offset', 'has_more'],
        properties: {
          total: {
            type: 'integer',
            description: 'Total number of items available',
            example: 42
          },
          limit: {
            type: 'integer',
            description: 'Maximum items per page',
            example: 20
          },
          offset: {
            type: 'integer',
            description: 'Number of items skipped',
            example: 0
          },
          has_more: {
            type: 'boolean',
            description: 'Whether more items are available',
            example: true
          }
        }
      },
      
      // Health Check Schemas
      HealthResponse: {
        type: 'object',
        required: ['status', 'timestamp'],
        properties: {
          status: {
            type: 'string',
            enum: ['healthy'],
            description: 'Service health status',
            example: 'healthy'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Health check timestamp',
            example: '2026-02-22T10:00:00Z'
          },
          version: {
            type: 'string',
            description: 'Service version',
            example: '1.1.0'
          }
        }
      },
      
      ReadinessResponse: {
        type: 'object',
        required: ['status', 'checks'],
        properties: {
          status: {
            type: 'string',
            enum: ['ready', 'not_ready'],
            description: 'Overall readiness status',
            example: 'ready'
          },
          checks: {
            type: 'object',
            description: 'Individual dependency status',
            properties: {
              database: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
                example: 'healthy'
              },
              pinecone: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
                example: 'healthy'
              },
              ollama: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
                example: 'healthy'
              },
              auth_service: {
                type: 'string',
                enum: ['healthy', 'unhealthy'],
                example: 'healthy'
              }
            }
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Readiness check timestamp',
            example: '2026-02-22T10:00:00Z'
          }
        }
      }
    },
    
    responses: {
      // Common Error Responses
      BadRequest: {
        description: 'Bad Request - Invalid or malformed request',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              invalid_request: {
                summary: 'Invalid request format',
                value: {
                  code: 'INVALID_REQUEST',
                  message: 'The request is invalid or malformed'
                }
              },
              query_too_long: {
                summary: 'Query exceeds maximum length',
                value: {
                  code: 'QUERY_TOO_LONG',
                  message: 'Query exceeds 2000 characters'
                }
              }
            }
          }
        }
      },
      
      Unauthorized: {
        description: 'Unauthorized - Authentication failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              missing_auth_header: {
                summary: 'Missing Authorization header',
                value: {
                  code: 'MISSING_AUTH_HEADER',
                  message: 'Authorization header is required'
                }
              },
              expired_token: {
                summary: 'JWT token expired',
                value: {
                  code: 'EXPIRED_TOKEN',
                  message: 'JWT token has expired'
                }
              },
              invalid_signature: {
                summary: 'Invalid HMAC signature',
                value: {
                  code: 'INVALID_SIGNATURE',
                  message: 'HMAC signature verification failed'
                }
              }
            }
          }
        }
      },
      
      Forbidden: {
        description: 'Forbidden - Access denied',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              org_mismatch: {
                summary: 'Organization mismatch',
                value: {
                  code: 'ORG_MISMATCH',
                  message: 'JWT organization does not match HMAC organization'
                }
              }
            }
          }
        }
      },
      
      NotFound: {
        description: 'Not Found - Resource does not exist',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              conversation_not_found: {
                summary: 'Conversation not found',
                value: {
                  code: 'CONVERSATION_NOT_FOUND',
                  message: 'Conversation not found or access denied'
                }
              }
            }
          }
        }
      },
      
      TooManyRequests: {
        description: 'Too Many Requests - Rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              rate_limited: {
                summary: 'Rate limit exceeded',
                value: {
                  code: 'RATE_LIMITED',
                  message: 'Rate limit exceeded: 30 requests per minute'
                }
              }
            }
          }
        }
      },
      
      InternalServerError: {
        description: 'Internal Server Error - Unexpected server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              internal_error: {
                summary: 'Internal server error',
                value: {
                  code: 'INTERNAL_ERROR',
                  message: 'An unexpected error occurred'
                }
              }
            }
          }
        }
      },
      
      ServiceUnavailable: {
        description: 'Service Unavailable - Dependency service unavailable',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse'
            },
            examples: {
              auth_service_unavailable: {
                summary: 'Auth service unavailable',
                value: {
                  code: 'AUTH_SERVICE_UNAVAILABLE',
                  message: 'Authentication service is temporarily unavailable'
                }
              }
            }
          }
        }
      }
    }
  },
  
  security: [
    {
      BearerAuth: [],
      HMACAuth: []
    }
  ],
  
  tags: [
    {
      name: 'Chat',
      description: 'RAG-powered conversational AI endpoints'
    },
    {
      name: 'Conversations',
      description: 'Conversation and message management'
    },
    {
      name: 'Health',
      description: 'Service health and readiness checks'
    },
    {
      name: 'Monitoring',
      description: 'Metrics and monitoring endpoints'
    }
  ]
};

// Swagger JSDoc options
const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../middleware/*.js'),
    path.join(__dirname, '../index.js')
  ]
};

// Generate OpenAPI specification
const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Swagger UI configuration
const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .scheme-container { background: #f8f9fa; }
  `,
  customSiteTitle: 'AI FAQ Platform - Chat Service API',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2
  }
};

module.exports = {
  swaggerSpec,
  swaggerUiOptions,
  swaggerDefinition
};
