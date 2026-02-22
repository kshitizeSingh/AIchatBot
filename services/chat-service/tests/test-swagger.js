/**
 * Test script to validate Swagger integration and documentation quality
 * This script tests the OpenAPI specification generation and Swagger UI functionality
 */

const request = require('supertest');
const app = require('../src/index');
const { swaggerSpec } = require('../src/config/swagger');

// Validate OpenAPI specification structure
function validateOpenAPISpec() {
  console.log('\n=== Validating OpenAPI Specification ===');
  
  const errors = [];
  
  // Check required top-level properties
  if (!swaggerSpec.openapi) errors.push('Missing openapi version');
  if (!swaggerSpec.info) errors.push('Missing info object');
  if (!swaggerSpec.paths) errors.push('Missing paths object');
  if (!swaggerSpec.components) errors.push('Missing components object');
  
  // Check info object
  if (swaggerSpec.info) {
    if (!swaggerSpec.info.title) errors.push('Missing info.title');
    if (!swaggerSpec.info.version) errors.push('Missing info.version');
    if (!swaggerSpec.info.description) errors.push('Missing info.description');
  }
  
  // Check security schemes
  if (swaggerSpec.components?.securitySchemes) {
    const schemes = swaggerSpec.components.securitySchemes;
    if (!schemes.BearerAuth) errors.push('Missing BearerAuth security scheme');
    if (!schemes.HMACAuth) errors.push('Missing HMACAuth security scheme');
  }
  
  // Check for required schemas
  if (swaggerSpec.components?.schemas) {
    const schemas = swaggerSpec.components.schemas;
    const requiredSchemas = [
      'ErrorResponse',
      'ChatQueryRequest',
      'ChatQueryResponse',
      'Conversation',
      'Message',
      'HealthResponse',
      'ReadinessResponse'
    ];
    
    requiredSchemas.forEach(schema => {
      if (!schemas[schema]) {
        errors.push(`Missing required schema: ${schema}`);
      }
    });
  }
  
  // Check paths
  const expectedPaths = [
    '/v1/chat/query',
    '/v1/chat/conversations',
    '/v1/chat/conversations/{id}/messages',
    '/v1/chat/conversations/{id}',
    '/health',
    '/ready',
    '/metrics'
  ];
  
  expectedPaths.forEach(path => {
    if (!swaggerSpec.paths[path]) {
      errors.push(`Missing path documentation: ${path}`);
    }
  });
  
  if (errors.length === 0) {
    console.log('✅ OpenAPI specification structure is valid');
    return true;
  } else {
    console.log('❌ OpenAPI specification validation failed:');
    errors.forEach(error => console.log(`  - ${error}`));
    return false;
  }
}

// Test Swagger UI endpoints
async function testSwaggerEndpoints() {
  console.log('\n=== Testing Swagger Endpoints ===');
  
  try {
    // Test Swagger UI page
    const swaggerUIResponse = await request(app)
      .get('/api-docs/')
      .expect(200);
    
    if (swaggerUIResponse.text.includes('Swagger UI')) {
      console.log('✅ Swagger UI page loads successfully');
    } else {
      console.log('❌ Swagger UI page content invalid');
      return false;
    }
    
    // Test OpenAPI spec endpoint
    const specResponse = await request(app)
      .get('/api-docs.json')
      .expect(200)
      .expect('Content-Type', /json/);
    
    const spec = specResponse.body;
    if (spec.openapi && spec.info && spec.paths) {
      console.log('✅ OpenAPI specification endpoint works correctly');
    } else {
      console.log('❌ OpenAPI specification endpoint returns invalid data');
      return false;
    }
    
    // Test service info endpoint
    const infoResponse = await request(app)
      .get('/')
      .expect(200)
      .expect('Content-Type', /json/);
    
    const info = infoResponse.body;
    if (info.service && info.documentation === '/api-docs') {
      console.log('✅ Service info endpoint works correctly');
    } else {
      console.log('❌ Service info endpoint returns invalid data');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Swagger endpoints test failed: ${error.message}`);
    return false;
  }
}

// Test documented endpoints accessibility
async function testDocumentedEndpoints() {
  console.log('\n=== Testing Documented Endpoints Accessibility ===');
  
  try {
    // Test health endpoints (should work without auth)
    await request(app)
      .get('/health')
      .expect(200);
    console.log('✅ /health endpoint accessible');
    
    await request(app)
      .get('/ready')
      .expect(200);
    console.log('✅ /ready endpoint accessible');
    
    await request(app)
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text/);
    console.log('✅ /metrics endpoint accessible');
    
    // Test protected endpoints (should return 401 without auth)
    await request(app)
      .post('/v1/chat/query')
      .expect(401);
    console.log('✅ /v1/chat/query requires authentication');
    
    await request(app)
      .get('/v1/chat/conversations')
      .expect(401);
    console.log('✅ /v1/chat/conversations requires authentication');
    
    return true;
  } catch (error) {
    console.log(`❌ Endpoint accessibility test failed: ${error.message}`);
    return false;
  }
}

// Validate error response formats
function validateErrorResponses() {
  console.log('\n=== Validating Error Response Documentation ===');
  
  const errorCodes = [
    'MISSING_AUTH_HEADER',
    'MISSING_HMAC_HEADERS', 
    'HMAC_TIMESTAMP_EXPIRED',
    'EXPIRED_TOKEN',
    'INVALID_TOKEN',
    'INVALID_SIGNATURE',
    'ORG_MISMATCH',
    'INVALID_REQUEST',
    'QUERY_TOO_LONG',
    'CONVERSATION_NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL_ERROR'
  ];
  
  const responses = swaggerSpec.components?.responses;
  if (!responses) {
    console.log('❌ No response components defined');
    return false;
  }
  
  const requiredResponses = [
    'BadRequest',
    'Unauthorized', 
    'Forbidden',
    'NotFound',
    'TooManyRequests',
    'InternalServerError'
  ];
  
  const missingResponses = requiredResponses.filter(resp => !responses[resp]);
  if (missingResponses.length > 0) {
    console.log(`❌ Missing response components: ${missingResponses.join(', ')}`);
    return false;
  }
  
  console.log('✅ All required error response components are documented');
  return true;
}

// Check for comprehensive examples
function validateExamples() {
  console.log('\n=== Validating Documentation Examples ===');
  
  const paths = swaggerSpec.paths;
  let exampleCount = 0;
  let pathsWithExamples = 0;
  
  Object.keys(paths).forEach(path => {
    const pathObj = paths[path];
    Object.keys(pathObj).forEach(method => {
      const operation = pathObj[method];
      
      // Check request body examples
      if (operation.requestBody?.content) {
        Object.values(operation.requestBody.content).forEach(content => {
          if (content.examples) {
            exampleCount += Object.keys(content.examples).length;
          }
        });
      }
      
      // Check response examples
      if (operation.responses) {
        Object.values(operation.responses).forEach(response => {
          if (response.content) {
            Object.values(response.content).forEach(content => {
              if (content.examples || content.example) {
                exampleCount++;
              }
            });
          }
        });
      }
      
      if (exampleCount > 0) {
        pathsWithExamples++;
      }
    });
  });
  
  console.log(`✅ Found ${exampleCount} examples across ${pathsWithExamples} documented operations`);
  
  if (exampleCount >= 10) {
    console.log('✅ Comprehensive examples provided');
    return true;
  } else {
    console.log('⚠️  Consider adding more examples for better documentation');
    return true; // Not a failure, just a recommendation
  }
}

// Main test runner
async function runSwaggerTests() {
  console.log('🚀 Starting Swagger Integration Tests\n');
  
  const results = {
    specValidation: validateOpenAPISpec(),
    errorResponses: validateErrorResponses(),
    examples: validateExamples(),
    endpoints: await testSwaggerEndpoints(),
    accessibility: await testDocumentedEndpoints()
  };
  
  console.log('\n=== Test Results Summary ===');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test}`);
  });
  
  console.log(`\n📊 Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All Swagger integration tests passed!');
    console.log('\n📖 Documentation is available at:');
    console.log('   - Swagger UI: http://localhost:3003/api-docs');
    console.log('   - OpenAPI Spec: http://localhost:3003/api-docs.json');
    console.log('   - Service Info: http://localhost:3003/');
    return true;
  } else {
    console.log('⚠️  Some tests failed. Please review the documentation.');
    return false;
  }
}

// Export for use in other test files
module.exports = {
  runSwaggerTests,
  validateOpenAPISpec,
  testSwaggerEndpoints,
  testDocumentedEndpoints,
  validateErrorResponses,
  validateExamples
};

// Run tests if this file is executed directly
if (require.main === module) {
  runSwaggerTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
