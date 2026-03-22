const axios = require('axios');
const generationService = require('../src/services/generationService');
const orchestrationService = require('../src/services/orchestrationService');
const { ollamaCircuitBreaker } = require('../src/utils/circuitBreaker');
const { healthMonitor } = require('../src/utils/healthMonitor');
const logger = require('../src/utils/logger');

/**
 * Comprehensive test suite for Ollama connectivity fixes
 * Tests timeout configurations, circuit breaker functionality, context optimization, and error handling
 */
class OllamaConnectivityTest {
  constructor() {
    this.testResults = [];
    this.testConfig = {
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      testModels: ['llama3:latest', 'nomic-embed-text:latest'],
      timeoutTests: [5000, 30000, 60000, 120000],
      contextSizes: [1000, 5000, 10000, 15000, 20000]
    };
  }

  /**
   * Run all connectivity tests
   * @returns {Promise<Object>} Test results summary
   */
  async runAllTests() {
    console.log('🚀 Starting Ollama Connectivity Test Suite...');
    console.log('=' .repeat(60));
    
    const startTime = Date.now();
    
    try {
      // Test 1: Basic connectivity
      await this.testBasicConnectivity();
      
      // Test 2: Model availability
      await this.testModelAvailability();
      
      // Test 3: Timeout configurations
      await this.testTimeoutConfigurations();
      
      // Test 4: Circuit breaker functionality
      await this.testCircuitBreakerFunctionality();
      
      // Test 5: Context optimization
      await this.testContextOptimization();
      
      // Test 6: Error handling scenarios
      await this.testErrorHandlingScenarios();
      
      // Test 7: Health monitoring
      await this.testHealthMonitoring();
      
      // Test 8: Load testing
      await this.testLoadHandling();
      
    } catch (error) {
      this.addTestResult('CRITICAL_FAILURE', false, `Test suite failed: ${error.message}`, error);
    }
    
    const duration = Date.now() - startTime;
    return this.generateTestReport(duration);
  }

  /**
   * Test basic Ollama service connectivity
   */
  async testBasicConnectivity() {
    console.log('\n📡 Testing Basic Connectivity...');
    
    try {
      // Test API endpoint availability
      const response = await axios.get(`${this.testConfig.ollamaUrl}/api/tags`, {
        timeout: 5000
      });
      
      this.addTestResult('BASIC_CONNECTIVITY', true, 'Ollama API is accessible', {
        status: response.status,
        modelsFound: response.data.models?.length || 0
      });
      
      // Test generation service availability
      const isAvailable = await generationService.isAvailable();
      this.addTestResult('SERVICE_AVAILABILITY', isAvailable, 
        isAvailable ? 'Generation service is available' : 'Generation service is not available');
      
    } catch (error) {
      this.addTestResult('BASIC_CONNECTIVITY', false, `Connectivity test failed: ${error.message}`, error);
    }
  }

  /**
   * Test model availability and validation
   */
  async testModelAvailability() {
    console.log('\n🤖 Testing Model Availability...');
    
    for (const model of this.testConfig.testModels) {
      try {
        await orchestrationService.validateModelAvailability(model);
        this.addTestResult('MODEL_AVAILABILITY', true, `Model ${model} is available`);
      } catch (error) {
        this.addTestResult('MODEL_AVAILABILITY', false, `Model ${model} validation failed: ${error.message}`, error);
      }
    }
  }

  /**
   * Test timeout configurations for different scenarios
   */
  async testTimeoutConfigurations() {
    console.log('\n⏱️ Testing Timeout Configurations...');
    
    for (const timeout of this.testConfig.timeoutTests) {
      try {
        const testMessages = [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "timeout test" and nothing else.' }
        ];
        
        const startTime = Date.now();
        await generationService.generateResponse(testMessages, {
          timeout,
          maxTokens: 10
        });
        const duration = Date.now() - startTime;
        
        this.addTestResult('TIMEOUT_CONFIG', true, `Timeout ${timeout}ms test passed`, {
          configuredTimeout: timeout,
          actualDuration: duration
        });
        
      } catch (error) {
        const isTimeoutError = error.message.includes('timeout') || error.code === 'ECONNABORTED';
        this.addTestResult('TIMEOUT_CONFIG', !isTimeoutError, 
          `Timeout ${timeout}ms test: ${error.message}`, error);
      }
    }
  }

  /**
   * Test circuit breaker functionality
   */
  async testCircuitBreakerFunctionality() {
    console.log('\n🔌 Testing Circuit Breaker Functionality...');
    
    try {
      // Get initial circuit breaker status
      const initialStatus = ollamaCircuitBreaker.getStatus();
      this.addTestResult('CIRCUIT_BREAKER_STATUS', true, 'Circuit breaker status retrieved', initialStatus);
      
      // Test circuit breaker with a valid request
      const testMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Circuit breaker test' }
      ];
      
      await generationService.generateResponse(testMessages, { maxTokens: 10 });
      this.addTestResult('CIRCUIT_BREAKER_NORMAL', true, 'Circuit breaker allows normal requests');
      
      // Test circuit breaker reset functionality
      ollamaCircuitBreaker.forceReset();
      const resetStatus = ollamaCircuitBreaker.getStatus();
      this.addTestResult('CIRCUIT_BREAKER_RESET', resetStatus.state === 'CLOSED', 
        'Circuit breaker reset functionality', resetStatus);
      
    } catch (error) {
      this.addTestResult('CIRCUIT_BREAKER_FUNCTIONALITY', false, 
        `Circuit breaker test failed: ${error.message}`, error);
    }
  }

  /**
   * Test context optimization with different sizes
   */
  async testContextOptimization() {
    console.log('\n📝 Testing Context Optimization...');
    
    for (const contextSize of this.testConfig.contextSizes) {
      try {
        // Generate test context of specified size
        const testContext = this.generateTestContext(contextSize);
        
        // Test context optimization
        const optimized = orchestrationService.optimizeContextForModel(testContext, 'llama3:latest');
        
        const reduction = ((testContext.length - optimized.length) / testContext.length) * 100;
        
        this.addTestResult('CONTEXT_OPTIMIZATION', true, 
          `Context optimization for ${contextSize} chars`, {
            originalSize: testContext.length,
            optimizedSize: optimized.length,
            reduction: `${reduction.toFixed(1)}%`
          });
        
      } catch (error) {
        this.addTestResult('CONTEXT_OPTIMIZATION', false, 
          `Context optimization failed for ${contextSize} chars: ${error.message}`, error);
      }
    }
  }

  /**
   * Test error handling scenarios
   */
  async testErrorHandlingScenarios() {
    console.log('\n🚨 Testing Error Handling Scenarios...');
    
    // Test invalid model error
    try {
      await generationService.generateResponse([
        { role: 'user', content: 'test' }
      ], { model: 'invalid-model' });
      
      this.addTestResult('ERROR_HANDLING_INVALID_MODEL', false, 'Should have thrown error for invalid model');
    } catch (error) {
      const isExpectedError = error.message.includes('not found') || error.message.includes('invalid');
      this.addTestResult('ERROR_HANDLING_INVALID_MODEL', isExpectedError, 
        'Invalid model error handling', { errorMessage: error.message });
    }
    
    // Test empty messages error
    try {
      await generationService.generateResponse([]);
      this.addTestResult('ERROR_HANDLING_EMPTY_MESSAGES', false, 'Should have thrown error for empty messages');
    } catch (error) {
      const isExpectedError = error.message.includes('required') || error.message.includes('empty');
      this.addTestResult('ERROR_HANDLING_EMPTY_MESSAGES', isExpectedError, 
        'Empty messages error handling', { errorMessage: error.message });
    }
    
    // Test malformed request error
    try {
      await generationService.generateResponse([
        { role: 'invalid', content: null }
      ]);
      this.addTestResult('ERROR_HANDLING_MALFORMED', false, 'Should have thrown error for malformed request');
    } catch (error) {
      this.addTestResult('ERROR_HANDLING_MALFORMED', true, 
        'Malformed request error handling', { errorMessage: error.message });
    }
  }

  /**
   * Test health monitoring functionality
   */
  async testHealthMonitoring() {
    console.log('\n🏥 Testing Health Monitoring...');
    
    try {
      // Register Ollama service for monitoring
      healthMonitor.registerService('ollama', async () => {
        return await generationService.getHealthStatus();
      });
      
      // Perform a health check
      const healthStatus = await healthMonitor.forceHealthCheck('ollama');
      this.addTestResult('HEALTH_MONITORING', healthStatus.status === 'healthy', 
        'Health monitoring functionality', healthStatus);
      
      // Test health status retrieval
      const overallHealth = healthMonitor.getHealthStatus();
      this.addTestResult('HEALTH_STATUS_RETRIEVAL', true, 
        'Health status retrieval', {
          totalServices: overallHealth.summary.totalServices,
          healthyServices: overallHealth.summary.healthyServices
        });
      
    } catch (error) {
      this.addTestResult('HEALTH_MONITORING', false, 
        `Health monitoring test failed: ${error.message}`, error);
    }
  }

  /**
   * Test load handling with concurrent requests
   */
  async testLoadHandling() {
    console.log('\n🔄 Testing Load Handling...');
    
    try {
      const concurrentRequests = 5;
      const testMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Load test request' }
      ];
      
      const startTime = Date.now();
      
      // Create concurrent requests
      const promises = Array(concurrentRequests).fill().map(async (_, index) => {
        try {
          const result = await generationService.generateResponse(testMessages, {
            maxTokens: 10,
            timeout: 30000
          });
          return { success: true, index, result };
        } catch (error) {
          return { success: false, index, error: error.message };
        }
      });
      
      const results = await Promise.all(promises);
      const successfulRequests = results.filter(r => r.success).length;
      const duration = Date.now() - startTime;
      
      this.addTestResult('LOAD_HANDLING', successfulRequests > 0, 
        `Load handling test with ${concurrentRequests} concurrent requests`, {
          totalRequests: concurrentRequests,
          successfulRequests,
          failedRequests: concurrentRequests - successfulRequests,
          totalDuration: `${duration}ms`,
          averageDuration: `${Math.round(duration / concurrentRequests)}ms`
        });
      
    } catch (error) {
      this.addTestResult('LOAD_HANDLING', false, 
        `Load handling test failed: ${error.message}`, error);
    }
  }

  /**
   * Generate test context of specified size
   * @param {number} size - Target size in characters
   * @returns {string} Generated test context
   */
  generateTestContext(size) {
    const baseText = 'This is a test context paragraph that will be repeated to create a context of the specified size. ';
    const repetitions = Math.ceil(size / baseText.length);
    return baseText.repeat(repetitions).substring(0, size);
  }

  /**
   * Add test result to results array
   * @param {string} testName - Name of the test
   * @param {boolean} passed - Whether the test passed
   * @param {string} message - Test result message
   * @param {Object} details - Additional test details
   */
  addTestResult(testName, passed, message, details = null) {
    const result = {
      testName,
      passed,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.push(result);
    
    const status = passed ? '✅' : '❌';
    console.log(`  ${status} ${testName}: ${message}`);
    
    if (!passed && details) {
      console.log(`     Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  /**
   * Generate comprehensive test report
   * @param {number} duration - Total test duration
   * @returns {Object} Test report
   */
  generateTestReport(duration) {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    
    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: `${successRate.toFixed(1)}%`,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      },
      testResults: this.testResults,
      recommendations: this.generateRecommendations()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Duration: ${duration}ms`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    return report;
  }

  /**
   * Generate recommendations based on test results
   * @returns {Array<string>} Array of recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.testResults.filter(r => !r.passed);
    
    if (failedTests.some(t => t.testName.includes('CONNECTIVITY'))) {
      recommendations.push('Check Ollama service is running and accessible on the configured port');
    }
    
    if (failedTests.some(t => t.testName.includes('MODEL_AVAILABILITY'))) {
      recommendations.push('Verify required models are pulled and available in Ollama');
    }
    
    if (failedTests.some(t => t.testName.includes('TIMEOUT'))) {
      recommendations.push('Consider increasing timeout values for large models or complex requests');
    }
    
    if (failedTests.some(t => t.testName.includes('CIRCUIT_BREAKER'))) {
      recommendations.push('Review circuit breaker configuration and failure thresholds');
    }
    
    if (failedTests.some(t => t.testName.includes('LOAD_HANDLING'))) {
      recommendations.push('Consider implementing request queuing or rate limiting for high load scenarios');
    }
    
    if (failedTests.length > this.testResults.length * 0.3) {
      recommendations.push('Multiple test failures detected - review Ollama service configuration and connectivity');
    }
    
    return recommendations;
  }
}

// Export for use in other modules
module.exports = OllamaConnectivityTest;

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new OllamaConnectivityTest();
  testSuite.runAllTests()
    .then(report => {
      console.log('\n🎉 Test suite completed!');
      process.exit(report.summary.failedTests > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}