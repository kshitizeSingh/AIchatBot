const logger = require('./logger');
const { circuitBreakerManager } = require('./circuitBreaker');

/**
 * Health monitoring utility for Ollama service
 * Provides proactive monitoring and alerting capabilities
 */
class HealthMonitor {
  constructor(options = {}) {
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.alertThreshold = options.alertThreshold || 3; // 3 consecutive failures
    this.services = new Map();
    this.isRunning = false;
    this.intervalId = null;
    
    // Health check history
    this.healthHistory = {
      checks: [],
      maxHistory: 100
    };
  }

  /**
   * Register a service for health monitoring
   * @param {string} serviceName - Name of the service
   * @param {Function} healthCheckFn - Function that returns health status
   * @param {Object} options - Service-specific options
   */
  registerService(serviceName, healthCheckFn, options = {}) {
    this.services.set(serviceName, {
      name: serviceName,
      healthCheckFn,
      consecutiveFailures: 0,
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      options: {
        timeout: 10000,
        retryAttempts: 1,
        alertThreshold: this.alertThreshold,
        ...options
      }
    });
    
    logger.info(`Health monitor registered service: ${serviceName}`, {
      checkInterval: this.checkInterval,
      alertThreshold: this.services.get(serviceName).options.alertThreshold
    });
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }
    
    this.isRunning = true;
    logger.info('Starting health monitor', {
      checkInterval: this.checkInterval,
      registeredServices: Array.from(this.services.keys())
    });
    
    // Perform initial health check
    this.performHealthChecks();
    
    // Schedule periodic health checks
    this.intervalId = setInterval(() => {
      this.performHealthChecks();
    }, this.checkInterval);
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    logger.info('Health monitor stopped');
  }

  /**
   * Perform health checks for all registered services
   */
  async performHealthChecks() {
    const checkTime = new Date().toISOString();
    const results = {};
    
    logger.debug('Performing health checks', {
      timestamp: checkTime,
      serviceCount: this.services.size
    });
    
    for (const [serviceName, serviceConfig] of this.services) {
      try {
        const result = await this.checkServiceHealth(serviceName, serviceConfig);
        results[serviceName] = result;
      } catch (error) {
        logger.error(`Health check failed for ${serviceName}`, {
          error: error.message,
          stack: error.stack
        });
        
        results[serviceName] = {
          status: 'error',
          message: `Health check execution failed: ${error.message}`,
          timestamp: checkTime
        };
      }
    }
    
    // Store health check results
    this.storeHealthCheckResults(checkTime, results);
    
    // Check for alerts
    this.checkForAlerts(results);
  }

  /**
   * Check health of a specific service
   * @param {string} serviceName - Service name
   * @param {Object} serviceConfig - Service configuration
   * @returns {Promise<Object>} Health check result
   */
  async checkServiceHealth(serviceName, serviceConfig) {
    const startTime = Date.now();
    serviceConfig.totalChecks++;
    serviceConfig.lastCheck = new Date().toISOString();
    
    try {
      // Execute health check with timeout
      const healthStatus = await Promise.race([
        serviceConfig.healthCheckFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), serviceConfig.options.timeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      
      // Update success metrics
      serviceConfig.successfulChecks++;
      serviceConfig.consecutiveFailures = 0;
      serviceConfig.lastSuccess = new Date().toISOString();
      
      logger.debug(`Health check passed for ${serviceName}`, {
        duration: `${duration}ms`,
        status: healthStatus.status
      });
      
      return {
        ...healthStatus,
        serviceName,
        duration: `${duration}ms`,
        consecutiveFailures: serviceConfig.consecutiveFailures
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update failure metrics
      serviceConfig.failedChecks++;
      serviceConfig.consecutiveFailures++;
      serviceConfig.lastFailure = new Date().toISOString();
      
      logger.warn(`Health check failed for ${serviceName}`, {
        duration: `${duration}ms`,
        consecutiveFailures: serviceConfig.consecutiveFailures,
        error: error.message
      });
      
      return {
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        serviceName,
        duration: `${duration}ms`,
        consecutiveFailures: serviceConfig.consecutiveFailures,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Store health check results in history
   * @param {string} checkTime - Check timestamp
   * @param {Object} results - Health check results
   */
  storeHealthCheckResults(checkTime, results) {
    this.healthHistory.checks.push({
      timestamp: checkTime,
      results
    });
    
    // Maintain history size limit
    if (this.healthHistory.checks.length > this.healthHistory.maxHistory) {
      this.healthHistory.checks.shift();
    }
  }

  /**
   * Check for alert conditions and trigger alerts
   * @param {Object} results - Health check results
   */
  checkForAlerts(results) {
    for (const [serviceName, result] of Object.entries(results)) {
      const serviceConfig = this.services.get(serviceName);
      
      if (!serviceConfig) continue;
      
      // Check if alert threshold is reached
      if (serviceConfig.consecutiveFailures >= serviceConfig.options.alertThreshold) {
        this.triggerAlert(serviceName, serviceConfig, result);
      }
      
      // Check if service recovered
      if (result.status === 'healthy' && serviceConfig.consecutiveFailures === 0 && serviceConfig.lastFailure) {
        this.triggerRecoveryAlert(serviceName, serviceConfig, result);
      }
    }
  }

  /**
   * Trigger alert for service failure
   * @param {string} serviceName - Service name
   * @param {Object} serviceConfig - Service configuration
   * @param {Object} result - Health check result
   */
  triggerAlert(serviceName, serviceConfig, result) {
    const alertData = {
      type: 'SERVICE_UNHEALTHY',
      serviceName,
      consecutiveFailures: serviceConfig.consecutiveFailures,
      threshold: serviceConfig.options.alertThreshold,
      lastSuccess: serviceConfig.lastSuccess,
      lastFailure: serviceConfig.lastFailure,
      message: result.message,
      timestamp: new Date().toISOString()
    };
    
    logger.error(`ALERT: Service ${serviceName} is unhealthy`, alertData);
    
    // Emit alert event for external handling
    this.emit('alert', alertData);
  }

  /**
   * Trigger recovery alert for service
   * @param {string} serviceName - Service name
   * @param {Object} serviceConfig - Service configuration
   * @param {Object} result - Health check result
   */
  triggerRecoveryAlert(serviceName, serviceConfig, result) {
    const recoveryData = {
      type: 'SERVICE_RECOVERED',
      serviceName,
      downtime: this.calculateDowntime(serviceConfig),
      message: result.message,
      timestamp: new Date().toISOString()
    };
    
    logger.info(`Service ${serviceName} has recovered`, recoveryData);
    
    // Emit recovery event for external handling
    this.emit('recovery', recoveryData);
  }

  /**
   * Calculate service downtime
   * @param {Object} serviceConfig - Service configuration
   * @returns {string} Downtime duration
   */
  calculateDowntime(serviceConfig) {
    if (!serviceConfig.lastFailure || !serviceConfig.lastSuccess) {
      return 'unknown';
    }
    
    const failureTime = new Date(serviceConfig.lastFailure);
    const successTime = new Date(serviceConfig.lastSuccess);
    const downtime = successTime - failureTime;
    
    return `${Math.round(downtime / 1000)}s`;
  }

  /**
   * Get current health status for all services
   * @returns {Object} Comprehensive health status
   */
  getHealthStatus() {
    const status = {
      monitoring: {
        isRunning: this.isRunning,
        checkInterval: this.checkInterval,
        lastCheck: this.healthHistory.checks.length > 0 
          ? this.healthHistory.checks[this.healthHistory.checks.length - 1].timestamp 
          : null
      },
      services: {},
      circuitBreakers: circuitBreakerManager.getAllStatuses(),
      summary: {
        totalServices: this.services.size,
        healthyServices: 0,
        unhealthyServices: 0,
        unknownServices: 0
      }
    };
    
    // Get service statuses
    for (const [serviceName, serviceConfig] of this.services) {
      const serviceStatus = {
        name: serviceName,
        totalChecks: serviceConfig.totalChecks,
        successfulChecks: serviceConfig.successfulChecks,
        failedChecks: serviceConfig.failedChecks,
        successRate: serviceConfig.totalChecks > 0 
          ? Math.round((serviceConfig.successfulChecks / serviceConfig.totalChecks) * 100) 
          : 0,
        consecutiveFailures: serviceConfig.consecutiveFailures,
        lastCheck: serviceConfig.lastCheck,
        lastSuccess: serviceConfig.lastSuccess,
        lastFailure: serviceConfig.lastFailure,
        status: this.determineServiceStatus(serviceConfig)
      };
      
      status.services[serviceName] = serviceStatus;
      
      // Update summary
      switch (serviceStatus.status) {
        case 'healthy':
          status.summary.healthyServices++;
          break;
        case 'unhealthy':
          status.summary.unhealthyServices++;
          break;
        default:
          status.summary.unknownServices++;
      }
    }
    
    return status;
  }

  /**
   * Determine service status based on configuration
   * @param {Object} serviceConfig - Service configuration
   * @returns {string} Service status
   */
  determineServiceStatus(serviceConfig) {
    if (serviceConfig.totalChecks === 0) {
      return 'unknown';
    }
    
    if (serviceConfig.consecutiveFailures >= serviceConfig.options.alertThreshold) {
      return 'unhealthy';
    }
    
    if (serviceConfig.consecutiveFailures === 0) {
      return 'healthy';
    }
    
    return 'degraded';
  }

  /**
   * Get health history
   * @param {number} limit - Number of recent checks to return
   * @returns {Array} Health check history
   */
  getHealthHistory(limit = 10) {
    return this.healthHistory.checks.slice(-limit);
  }

  /**
   * Simple event emitter for alerts
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    // Simple logging-based event emission
    // In a real implementation, you might use EventEmitter or external notification system
    logger.info(`Health monitor event: ${event}`, data);
  }

  /**
   * Force health check for a specific service
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Health check result
   */
  async forceHealthCheck(serviceName) {
    const serviceConfig = this.services.get(serviceName);
    
    if (!serviceConfig) {
      throw new Error(`Service '${serviceName}' is not registered`);
    }
    
    logger.info(`Forcing health check for ${serviceName}`);
    return await this.checkServiceHealth(serviceName, serviceConfig);
  }
}

// Create singleton instance
const healthMonitor = new HealthMonitor();

module.exports = {
  HealthMonitor,
  healthMonitor
};