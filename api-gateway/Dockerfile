# Nginx API Gateway Dockerfile
# Multi-stage build for optimized production image

# Build stage for custom nginx modules (if needed)
FROM nginx:1.25-alpine as builder

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    libc-dev \
    make \
    openssl-dev \
    pcre-dev \
    zlib-dev \
    linux-headers \
    curl \
    gnupg \
    libxslt-dev \
    gd-dev \
    geoip-dev

# Production stage
FROM nginx:1.25-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    tzdata \
    logrotate

# Create nginx user and directories
RUN addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Create necessary directories
RUN mkdir -p /var/log/nginx /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html/docs

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
COPY html/ /usr/share/nginx/html/

# Copy health check script
COPY scripts/health-check.sh /usr/local/bin/health-check.sh
RUN chmod +x /usr/local/bin/health-check.sh

# Copy logrotate configuration
COPY logrotate/nginx /etc/logrotate.d/nginx

# Set proper permissions
RUN chown -R nginx:nginx /var/log/nginx /var/cache/nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod 644 /etc/nginx/nginx.conf /etc/nginx/conf.d/*

# Create log files with proper permissions
RUN touch /var/log/nginx/access.log /var/log/nginx/error.log && \
    chown nginx:nginx /var/log/nginx/access.log /var/log/nginx/error.log

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Use nginx user
USER nginx

# Start nginx
CMD ["nginx", "-g", "daemon off;"]