# Multi-stage build for Chat & Orchestration Service
FROM node:18-alpine AS base

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatservice -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R chatservice:nodejs /app

# Switch to non-root user
USER chatservice

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["dumb-init", "node", "src/index.js"]

# Development stage
FROM base AS development

# Switch back to root for development dependencies
USER root

# Install development dependencies
RUN npm ci && npm cache clean --force

# Install nodemon globally
RUN npm install -g nodemon

# Switch back to chatservice user
USER chatservice

# Override CMD for development
CMD ["dumb-init", "nodemon", "src/index.js"]

# Production stage (default)
FROM base AS production

# Production is the default stage
# All production optimizations are already in base stage