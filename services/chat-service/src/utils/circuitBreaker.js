const logger = require('./logger');

/**
 * Circuit Breaker pattern implementation for external service calls
 * Prevents cascading failures and provides graceful degradation
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.expectedErrors = options.expectedErrors || [];
    
    // Circuit breaker state
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Monitoring
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      circuitOpenEvents: 0,
      lastResetTime: Date.now()
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result or circuit breaker error
   */
  async execute(fn, options = {}) {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        const error = new Error(`Circuit breaker '${this.name}' is OPEN. Next attempt in ${this.nextAttemptTime - Date.now()}ms`);
        error.circuitBreakerState = 'OPEN';
        throw error;
      } else {
        // Move to half-open state
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker '${this.name}' moved to HALF_OPEN state`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error, startTime);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.stats.successfulRequests++;
    
    if (this.state === 'HALF_OPEN') {
      // Reset circuit breaker
      this.reset();
      logger.info(`Circuit breaker '${this.name}' reset to CLOSED state after successful call`);
    }
    
    // Reset failure count on success
    this.failureCount = 0;
  }

  /**
   * Handle failed execution
   * @param {Error} error - The error that occurred
   * @param {number} startTime - Request start time
   */
  onFailure(error, startTime) {
    this.stats.failedRequests++;
    
    // Check if this is a timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      this.stats.timeouts++;
    }
    
    // Don't count expected errors towards circuit breaker
    if (this.isExpectedError(error)) {
      logger.debug(`Circuit breaker '${this.name}' ignoring expected error`, {
        error: error.message,
        code: error.code
      });
      return;
    }
    
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    logger.warn(`Circuit breaker '${this.name}' failure`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: error.message,
      code: error.code,
      duration: Date.now() - startTime
    });
    
    // Check if we should open the circuit
    if (this.failureCount >= this.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  openCircuit() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.resetTimeout;
    this.stats.circuitOpenEvents++;
    
    logger.error(`Circuit breaker '${this.name}' OPENED`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      resetTimeout: this.resetTimeout,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
    });
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.stats.lastResetTime = Date.now();
  }

  /**
   * Check if an error is expected and shouldn't trigger circuit breaker
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is expected
   */
  isExpectedError(error) {
    const statusCode = error.response?.status || error.status || error.statusCode;
    
    // Don't trigger circuit breaker for client errors (4xx)
    if (statusCode >= 400 && statusCode < 500) {
      return true;
    }
    
    // Check against configured expected errors
    return this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message?.includes(expectedError) || error.code === expectedError;
      }
      if (typeof expectedError === 'number') {
        return statusCode === expectedError;
      }
      return false;
    });
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Status information
   */
  getStatus() {
    const now = Date.now();
    const uptime = now - this.stats.lastResetTime;
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100 
      : 0;

    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null,
      timeUntilNextAttempt: this.nextAttemptTime ? Math.max(0, this.nextAttemptTime - now) : null,
      stats: {
        ...this.stats,
        successRate: Math.round(successRate * 100) / 100,
        uptime: uptime
      }
    };
  }

  /**
   * Force reset the circuit breaker (admin function)
   */
  forceReset() {
    logger.info(`Circuit breaker '${this.name}' force reset`);
    this.reset();
  }

  /**
   * Force open the circuit breaker (admin function)
   */
  forceOpen() {
    logger.warn(`Circuit breaker '${this.name}' force opened`);
    this.openCircuit();
  }
}

/**
 * Circuit breaker manager for handling multiple circuit breakers
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Object} options - Circuit breaker options
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...options, name }));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breaker statuses
   * @returns {Object} All circuit breaker statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [name, breaker] of this.breakers) {
      statuses[name] = breaker.getStatus();
    }
    return statuses;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.forceReset();
    }
    logger.info('All circuit breakers reset');
  }
}

// Create singleton manager
const circuitBreakerManager = new CircuitBreakerManager();

// Pre-configured circuit breakers for common services
const ollamaCircuitBreaker = circuitBreakerManager.getBreaker('ollama', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  expectedErrors: [400, 401, 403, 404] // Don't trigger on client errors
});

const pineconeCircuitBreaker = circuitBreakerManager.getBreaker('pinecone', {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  expectedErrors: [400, 401, 403] // Don't trigger on auth/validation errors
});

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  ollamaCircuitBreaker,
  pineconeCircuitBreaker
};