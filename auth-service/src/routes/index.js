/**
 * Routes index file
 * Aggregates all route modules and exports main router
 */

const express = require('express');
const authRoutes = require('./authRoutes');
const orgRoutes = require('./orgRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

// Health check route (already handled in app.js, but can be here too)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/org', orgRoutes);
router.use('/users', userRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    service: 'Auth Service API',
    version: '1.0.0',
    description: 'Complete authentication and authorization service for multi-tenant FAQ platform',
    endpoints: {
      authentication: '/v1/auth',
      organization: '/v1/org',
      users: '/v1/users',
      documentation: '/docs',
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;