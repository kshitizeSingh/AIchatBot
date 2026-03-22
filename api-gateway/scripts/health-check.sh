#!/bin/bash

# Nginx API Gateway Health Check Script
# This script performs comprehensive health checks for the API gateway

set -e

# Configuration
HEALTH_ENDPOINT="http://localhost/health"
TIMEOUT=10
MAX_RETRIES=3
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Error function
error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Success function
success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Warning function
warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if nginx process is running
check_nginx_process() {
    log "Checking nginx process..."
    if pgrep nginx > /dev/null; then
        success "Nginx process is running"
        return 0
    else
        error "Nginx process is not running"
        return 1
    fi
}

# Check nginx configuration
check_nginx_config() {
    log "Checking nginx configuration..."
    if nginx -t 2>/dev/null; then
        success "Nginx configuration is valid"
        return 0
    else
        error "Nginx configuration is invalid"
        return 1
    fi
}

# Check health endpoint
check_health_endpoint() {
    log "Checking health endpoint: $HEALTH_ENDPOINT"
    
    local retry_count=0
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if curl -f -s --max-time $TIMEOUT "$HEALTH_ENDPOINT" > /dev/null; then
            success "Health endpoint is responding"
            return 0
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $MAX_RETRIES ]; then
                warning "Health endpoint check failed (attempt $retry_count/$MAX_RETRIES). Retrying in ${RETRY_DELAY}s..."
                sleep $RETRY_DELAY
            fi
        fi
    done
    
    error "Health endpoint is not responding after $MAX_RETRIES attempts"
    return 1
}

# Check upstream services
check_upstream_services() {
    log "Checking upstream services..."
    
    local services=("auth" "content" "chat")
    local failed_services=()
    
    for service in "${services[@]}"; do
        local endpoint="http://localhost/health/$service"
        if curl -f -s --max-time $TIMEOUT "$endpoint" > /dev/null; then
            success "$service service is healthy"
        else
            warning "$service service health check failed"
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        success "All upstream services are healthy"
        return 0
    else
        warning "Some upstream services are unhealthy: ${failed_services[*]}"
        return 1
    fi
}

# Check log files
check_log_files() {
    log "Checking log files..."
    
    local access_log="/var/log/nginx/access.log"
    local error_log="/var/log/nginx/error.log"
    
    if [ -f "$access_log" ] && [ -w "$access_log" ]; then
        success "Access log is writable"
    else
        error "Access log is not writable: $access_log"
        return 1
    fi
    
    if [ -f "$error_log" ] && [ -w "$error_log" ]; then
        success "Error log is writable"
    else
        error "Error log is not writable: $error_log"
        return 1
    fi
    
    return 0
}

# Check disk space
check_disk_space() {
    log "Checking disk space..."
    
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    local threshold=90
    
    if [ "$usage" -lt "$threshold" ]; then
        success "Disk usage is acceptable: ${usage}%"
        return 0
    else
        warning "Disk usage is high: ${usage}% (threshold: ${threshold}%)"
        return 1
    fi
}

# Check memory usage
check_memory_usage() {
    log "Checking memory usage..."
    
    local memory_info=$(free | grep Mem)
    local total=$(echo $memory_info | awk '{print $2}')
    local used=$(echo $memory_info | awk '{print $3}')
    local usage=$((used * 100 / total))
    local threshold=90
    
    if [ "$usage" -lt "$threshold" ]; then
        success "Memory usage is acceptable: ${usage}%"
        return 0
    else
        warning "Memory usage is high: ${usage}% (threshold: ${threshold}%)"
        return 1
    fi
}

# Main health check function
main() {
    log "Starting API Gateway health check..."
    
    local checks_passed=0
    local total_checks=6
    
    # Run all health checks
    check_nginx_process && ((checks_passed++))
    check_nginx_config && ((checks_passed++))
    check_health_endpoint && ((checks_passed++))
    check_upstream_services && ((checks_passed++))
    check_log_files && ((checks_passed++))
    check_disk_space && ((checks_passed++))
    check_memory_usage # Don't fail on memory warning
    
    log "Health check completed: $checks_passed/$total_checks checks passed"
    
    # Exit with appropriate code
    if [ $checks_passed -eq $total_checks ]; then
        success "API Gateway is healthy"
        exit 0
    elif [ $checks_passed -ge $((total_checks - 1)) ]; then
        warning "API Gateway is partially healthy"
        exit 0
    else
        error "API Gateway is unhealthy"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "--nginx-only")
        check_nginx_process && check_nginx_config
        ;;
    "--endpoint-only")
        check_health_endpoint
        ;;
    "--upstream-only")
        check_upstream_services
        ;;
    "--help")
        echo "Usage: $0 [--nginx-only|--endpoint-only|--upstream-only|--help]"
        echo "  --nginx-only    Check only nginx process and configuration"
        echo "  --endpoint-only Check only the health endpoint"
        echo "  --upstream-only Check only upstream services"
        echo "  --help          Show this help message"
        exit 0
        ;;
    *)
        main
        ;;
esac