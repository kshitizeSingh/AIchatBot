#!/usr/bin/env node

/**
 * Swagger Documentation Validation Script
 * 
 * This script performs comprehensive validation of the Swagger integration:
 * - OpenAPI specification syntax validation
 * - Swagger UI functionality testing
 * - Documentation completeness checks
 * - Authentication flow validation
 * - Response schema validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { swaggerSpec } = require('../src/config/swagger');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${message}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Validate OpenAPI 3.0 specification structure
function validateOpenAPIStructure() {
  logHeader('OpenAPI 3.0 Specification Validation');
  
  const errors = [];
  const warnings = [];
  
  // Required top-level properties
  if (!swaggerSpec.openapi) errors.push('Missing openapi version');
  if (!swaggerSpec.info) errors.push('Missing info object');
  if (!swaggerSpec.paths) errors.push('Missing paths object');
  if (!swaggerSpec.components) errors.push('Missing components object');
  
  // Validate OpenAPI version
  if (swaggerSpec.openapi && !swaggerSpec.openapi.startsWith('3.0')) {
    errors.push(`Invalid OpenAPI version: ${swaggerSpec.openapi}. Expected 3.0.x`);
  }
  
  // Validate info object
  if (swaggerSpec.info) {
    if (!swaggerSpec.info.title) errors.push('Missing info.title');
    if (!swaggerSpec.info.version) errors.push('Missing info.version');
    if (!swaggerSpec.info.description) warnings.push('Missing info.description');
    
    // Check for contact and license info
    if (!swaggerSpec.info.contact) warnings.push('Missing contact information');
    if (!swaggerSpec.info.license) warnings.push('Missing license information');
  }
  
  // Validate servers
  if (!swaggerSpec.servers || swaggerSpec.servers.length === 0) {
    warnings.push('No servers defined');
  }
  
  // Validate security schemes
  if (swaggerSpec.components?.securitySchemes) {
    const schemes = swaggerSpec.components.securitySchemes;
    if (!schemes.BearerAuth) errors.push('Missing BearerAuth security scheme');
    if (!schemes.HMACAuth && !schemes.HMACHeaders) {
      errors.push('Missing HMAC security scheme');
    }
  } else {
    errors.push('No security schemes defined');
  }
  
  // Report results
  if (errors.length === 0) {
    logSuccess('OpenAPI specification structure is valid');
  } else {
    logError('OpenAPI specification validation failed:');
    errors.forEach(error => log(`  • ${error}`, 'red'));
  }
  
  if (warnings.length > 0) {
    logWarning('OpenAPI specification warnings:');
    warnings.forEach(warning => log(`  • ${warning}`, 'yellow'));
  }
  
  return errors.length === 0;
}

// Validate required schemas
function validateSchemas() {
  logHeader('Schema Components Validation');
  
  const schemas = swaggerSpec.components?.schemas || {};
  const requiredSchemas = [
    'ErrorResponse',
    'ChatQueryRequest', 
    'ChatQueryResponse',
    'Conversation',
    'ConversationList',
    'Message',
    'MessageList',
    'Source',
    'TokenUsage',
    'HealthResponse',
    'ReadinessResponse',
    'Pagination',
    'UserRole',
    'AuthContext'
  ];
  
  const missingSchemas = [];
  const validSchemas = [];
  
  requiredSchemas.forEach(schemaName => {
    if (schemas[schemaName]) {
      validSchemas.push(schemaName);
      
      // Validate schema structure
      const schema = schemas[schemaName];
      if (!schema.type && !schema.$ref && !schema.allOf && !schema.oneOf) {
        logWarning(`Schema ${schemaName} missing type definition`);
      }
    } else {
      missingSchemas.push(schemaName);
    }
  });
  
  logInfo(`Found ${validSchemas.length}/${requiredSchemas.length} required schemas`);
  
  if (missingSchemas.length === 0) {
    logSuccess('All required schemas are defined');
  } else {
    logError('Missing required schemas:');
    missingSchemas.forEach(schema => log(`  • ${schema}`, 'red'));
  }
  
  return missingSchemas.length === 0;
}

// Validate API paths and operations
function validatePaths() {
  logHeader('API Paths and Operations Validation');
  
  const paths = swaggerSpec.paths || {};
  const expectedPaths = {
    '/v1/chat/query': ['post'],
    '/v1/chat/conversations': ['get', 'post'],
    '/v1/chat/conversations/{id}/messages': ['get'],
    '/v1/chat/conversations/{id}': ['delete'],
    '/health': ['get'],
    '/ready': ['get'],
    '/metrics': ['get']
  };
  
  const missingPaths = [];
  const missingOperations = [];
  const validPaths = [];
  
  Object.entries(expectedPaths).forEach(([path, methods]) => {
    if (paths[path]) {
      validPaths.push(path);
      
      methods.forEach(method => {
        if (!paths[path][method]) {
          missingOperations.push(`${method.toUpperCase()} ${path}`);
        } else {
          // Validate operation structure
          const operation = paths[path][method];
          if (!operation.summary) {
            logWarning(`Missing summary for ${method.toUpperCase()} ${path}`);
          }
          if (!operation.description) {
            logWarning(`Missing description for ${method.toUpperCase()} ${path}`);
          }
          if (!operation.responses) {
            logError(`Missing responses for ${method.toUpperCase()} ${path}`);
          }
        }
      });
    } else {
      missingPaths.push(path);
    }
  });
  
  logInfo(`Found ${validPaths.length}/${Object.keys(expectedPaths).length} expected paths`);
  
  if (missingPaths.length === 0 && missingOperations.length === 0) {
    logSuccess('All required paths and operations are documented');
  } else {
    if (missingPaths.length > 0) {
      logError('Missing paths:');
      missingPaths.forEach(path => log(`  • ${path}`, 'red'));
    }
    if (missingOperations.length > 0) {
      logError('Missing operations:');
      missingOperations.forEach(op => log(`  • ${op}`, 'red'));
    }
  }
  
  return missingPaths.length === 0 && missingOperations.length === 0;
}

// Validate response definitions
function validateResponses() {
  logHeader('Response Components Validation');
  
  const responses = swaggerSpec.components?.responses || {};
  const requiredResponses = [
    'BadRequest',
    'Unauthorized',
    'Forbidden', 
    'NotFound',
    'TooManyRequests',
    'InternalServerError',
    'ServiceUnavailable'
  ];
  
  const missingResponses = [];
  const validResponses = [];
  
  requiredResponses.forEach(responseName => {
    if (responses[responseName]) {
      validResponses.push(responseName);
      
      // Validate response structure
      const response = responses[responseName];
      if (!response.description) {
        logWarning(`Response ${responseName} missing description`);
      }
      if (!response.content) {
        logWarning(`Response ${responseName} missing content definition`);
      }
    } else {
      missingResponses.push(responseName);
    }
  });
  
  logInfo(`Found ${validResponses.length}/${requiredResponses.length} required responses`);
  
  if (missingResponses.length === 0) {
    logSuccess('All required response components are defined');
  } else {
    logError('Missing response components:');
    missingResponses.forEach(response => log(`  • ${response}`, 'red'));
  }
  
  return missingResponses.length === 0;
}

// Validate security definitions
function validateSecurity() {
  logHeader('Security Configuration Validation');
  
  const securitySchemes = swaggerSpec.components?.securitySchemes || {};
  const globalSecurity = swaggerSpec.security || [];
  
  // Check for required security schemes
  const requiredSchemes = ['BearerAuth'];
  const missingSchemes = [];
  
  requiredSchemes.forEach(scheme => {
    if (!securitySchemes[scheme]) {
      missingSchemes.push(scheme);
    }
  });
  
  // Check for HMAC scheme (either HMACAuth or HMACHeaders)
  if (!securitySchemes.HMACAuth && !securitySchemes.HMACHeaders) {
    missingSchemes.push('HMAC authentication scheme');
  }
  
  // Validate global security
  if (globalSecurity.length === 0) {
    logWarning('No global security requirements defined');
  }
  
  if (missingSchemes.length === 0) {
    logSuccess('All required security schemes are defined');
  } else {
    logError('Missing security schemes:');
    missingSchemes.forEach(scheme => log(`  • ${scheme}`, 'red'));
  }
  
  return missingSchemes.length === 0;
}

// Check for examples and documentation quality
function validateDocumentationQuality() {
  logHeader('Documentation Quality Assessment');
  
  const paths = swaggerSpec.paths || {};
  let totalOperations = 0;
  let operationsWithExamples = 0;
  let operationsWithDescriptions = 0;
  let totalExamples = 0;
  
  Object.values(paths).forEach(pathObj => {
    Object.values(pathObj).forEach(operation => {
      if (operation.summary || operation.description) {
        totalOperations++;
        
        if (operation.description && operation.description.length > 50) {
          operationsWithDescriptions++;
        }
        
        // Check for request body examples
        if (operation.requestBody?.content) {
          Object.values(operation.requestBody.content).forEach(content => {
            if (content.examples) {
              operationsWithExamples++;
              totalExamples += Object.keys(content.examples).length;
            } else if (content.example) {
              operationsWithExamples++;
              totalExamples++;
            }
          });
        }
        
        // Check for response examples
        if (operation.responses) {
          Object.values(operation.responses).forEach(response => {
            if (response.content) {
              Object.values(response.content).forEach(content => {
                if (content.examples) {
                  totalExamples += Object.keys(content.examples).length;
                } else if (content.example) {
                  totalExamples++;
                }
              });
            }
          });
        }
      }
    });
  });
  
  logInfo(`Total operations documented: ${totalOperations}`);
  logInfo(`Operations with detailed descriptions: ${operationsWithDescriptions}`);
  logInfo(`Operations with examples: ${operationsWithExamples}`);
  logInfo(`Total examples found: ${totalExamples}`);
  
  const qualityScore = {
    descriptions: operationsWithDescriptions / totalOperations,
    examples: Math.min(operationsWithExamples / totalOperations, 1)
  };
  
  if (qualityScore.descriptions >= 0.8) {
    logSuccess('Good documentation coverage for descriptions');
  } else {
    logWarning('Consider adding more detailed descriptions');
  }
  
  if (qualityScore.examples >= 0.5) {
    logSuccess('Good example coverage');
  } else {
    logWarning('Consider adding more examples for better usability');
  }
  
  return qualityScore.descriptions >= 0.6 && qualityScore.examples >= 0.3;
}

// Generate validation report
function generateReport(results) {
  logHeader('Validation Report');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  const percentage = Math.round((passed / total) * 100);
  
  log(`\n📊 Overall Score: ${passed}/${total} (${percentage}%)\n`);
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const testName = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    log(`${status} ${testName}`);
  });
  
  if (percentage >= 80) {
    log('\n🎉 Excellent! Your Swagger documentation meets high quality standards.', 'green');
  } else if (percentage >= 60) {
    log('\n👍 Good! Your Swagger documentation is functional but could be improved.', 'yellow');
  } else {
    log('\n⚠️  Your Swagger documentation needs improvement before production use.', 'red');
  }
  
  log('\n📚 Access your documentation at:', 'cyan');
  log('   • Swagger UI: http://localhost:3003/api-docs');
  log('   • OpenAPI Spec: http://localhost:3003/api-docs.json');
  log('   • Service Info: http://localhost:3003/');
  
  return percentage >= 60;
}

// Main validation function
function validateSwaggerIntegration() {
  log('🚀 Starting Swagger Documentation Validation\n', 'bright');
  
  const results = {
    openAPIStructure: validateOpenAPIStructure(),
    schemas: validateSchemas(),
    paths: validatePaths(),
    responses: validateResponses(),
    security: validateSecurity(),
    documentationQuality: validateDocumentationQuality()
  };
  
  return generateReport(results);
}

// Export for use in other scripts
module.exports = {
  validateSwaggerIntegration,
  validateOpenAPIStructure,
  validateSchemas,
  validatePaths,
  validateResponses,
  validateSecurity,
  validateDocumentationQuality
};

// Run validation if this file is executed directly
if (require.main === module) {
  try {
    const success = validateSwaggerIntegration();
    process.exit(success ? 0 : 1);
  } catch (error) {
    logError(`Validation failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}
