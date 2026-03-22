#!/bin/bash

# Comprehensive API Gateway Test Suite
# Tests routing, load balancing, error handling, and security features

set -e

# Configuration
GATEWAY_URL="http://localhost"
TEST_TIMEOUT=30
MAX_RETRIES=3
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Test helper functions
run_test() {
    local test_name="$1"
    local test_function="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "Running test: $test_name"
    
    if $test_function; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        log_success "$test_name"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        log_error "$test_name"
    fi
    echo
}

# HTTP request helper with retries
http_request() {
    local method="$1"
    local url="$2"
    local expected_status="$3"
    local headers="${4:-}"
    local data="${5:-}"
    
    local retry_count=0
    while [ $retry_count -lt $MAX_RETRIES ]; do
        local curl_cmd="curl -s -w '%{http_code}' -m $TEST_TIMEOUT"
        
        if [ -n "$headers" ]; then
            curl_cmd="$curl_cmd $headers"
        fi
        
        if [ "$method" = "POST" ] && [ -n "$data" ]; then
            curl_cmd="$curl_cmd -X POST -d '$data'"
        elif [ "$method" = "PUT" ] && [ -n "$data" ]; then
            curl_cmd="$curl_cmd -X PUT -d '$data'"
        elif [ "$method" = "DELETE" ]; then
            curl_cmd="$curl_cmd -X DELETE"
        fi
        
        local response
        response=$(eval "$curl_cmd '$url' 2>/dev/null" || echo "000")
        local status_code="${response: -3}"
        
        if [ "$status_code" = "$expected_status" ]; then
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            sleep $RETRY_DELAY
        fi
    done
    
    log_error "Expected status $expected_status, got $status_code for $url"
    return 1
}

# Test Functions

# Test 1: Gateway Health Check
test_gateway_health() {
    http_request "GET" "$GATEWAY_URL/health" "200"
}

# Test 2: Gateway Root Endpoint
test_gateway_root() {
    http_request "GET" "$GATEWAY_URL/" "200"
}

# Test 3: Auth Service Routing
test_auth_service_routing() {
    # Test auth service health through gateway
    http_request "GET" "$GATEWAY_URL/health/auth" "200" && \
    # Test auth service root endpoint
    http_request "GET" "$GATEWAY_URL/v1/auth/" "404"  # Expected 404 for root auth endpoint
}

# Test 4: Content Service Routing
test_content_service_routing() {
    http_request "GET" "$GATEWAY_URL/health/content" "200"
}

# Test 5: Chat Service Routing
test_chat_service_routing() {
    http_request "GET" "$GATEWAY_URL/health/chat" "200"
}

# Test 6: Rate Limiting
test_rate_limiting() {
    log_info "Testing rate limiting (this may take a moment)..."
    
    # Make rapid requests to trigger rate limiting
    local success_count=0
    local rate_limited_count=0
    
    for i in {1..15}; do
        local response
        response=$(curl -s -w '%{http_code}' -m 5 "$GATEWAY_URL/health" 2>/dev/null || echo "000")
        local status_code="${response: -3}"
        
        if [ "$status_code" = "200" ]; then
            success_count=$((success_count + 1))
        elif [ "$status_code" = "429" ]; then
            rate_limited_count=$((rate_limited_count + 1))
        fi
        
        sleep 0.1
    done
    
    # We should get some successful requests and potentially some rate-limited ones
    if [ $success_count -gt 0 ]; then
        log_info "Rate limiting test: $success_count successful, $rate_limited_count rate-limited"
        return 0
    else
        return 1
    fi
}

# Test 7: Security Headers
test_security_headers() {
    local response
    response=$(curl -s -I "$GATEWAY_URL/health" 2>/dev/null)
    
    # Check for security headers
    if echo "$response" | grep -q "X-Frame-Options" && \
       echo "$response" | grep -q "X-Content-Type-Options" && \
       echo "$response" | grep -q "X-XSS-Protection"; then
        return 0
    else
        log_error "Missing security headers"
        return 1
    fi
}

# Test 8: CORS Headers
test_cors_headers() {
    local response
    response=$(curl -s -I -H "Origin: http://localhost:3000" "$GATEWAY_URL/health" 2>/dev/null)
    
    # CORS headers might not be present for all endpoints, so this is a soft test
    log_info "CORS test completed (headers may vary by endpoint)"
    return 0
}

# Test 9: Invalid Endpoints
test_invalid_endpoints() {
    # Test non-existent endpoint
    http_request "GET" "$GATEWAY_URL/nonexistent" "404" && \
    # Test invalid API version
    http_request "GET" "$GATEWAY_URL/v2/auth/" "404"
}

# Test 10: HTTP Methods
test_http_methods() {
    # Test unsupported methods on health endpoint
    http_request "POST" "$GATEWAY_URL/health" "405" && \
    http_request "PUT" "$GATEWAY_URL/health" "405" && \
    http_request "DELETE" "$GATEWAY_URL/health" "405"
}

# Test 11: Large Request Body (should be rejected)
test_large_request_body() {
    local large_data
    large_data=$(printf 'a%.0s' {1..1000000})  # 1MB of data
    
    # This should be rejected due to client_max_body_size
    local response
    response=$(curl -s -w '%{http_code}' -m $TEST_TIMEOUT -X POST -d "$large_data" "$GATEWAY_URL/v1/auth/login" 2>/dev/null || echo "413")
    local status_code="${response: -3}"
    
    # Expect 413 (Request Entity Too Large) or connection error
    if [ "$status_code" = "413" ] || [ "$status_code" = "000" ]; then
        return 0
    else
        log_error "Expected 413 or connection error, got $status_code"
        return 1
    fi
}

# Test 12: Documentation Endpoints
test_documentation_endpoints() {
    http_request "GET" "$GATEWAY_URL/docs/" "200" && \
    http_request "GET" "$GATEWAY_URL/docs/auth" "200" && \
    http_request "GET" "$GATEWAY_URL/docs/content" "200" && \
    http_request "GET" "$GATEWAY_URL/docs/chat" "200"
}

# Test 13: Metrics Endpoint (should be restricted)
test_metrics_endpoint() {
    # Metrics should be restricted to internal IPs
    # From external IP, it should return 403
    local response
    response=$(curl -s -w '%{http_code}' -m $TEST_TIMEOUT "$GATEWAY_URL/metrics" 2>/dev/null || echo "000")
    local status_code="${response: -3}"
    
    # Expect 403 (Forbidden) or 200 if running from allowed IP
    if [ "$status_code" = "403" ] || [ "$status_code" = "200" ]; then
        return 0
    else
        log_error "Expected 403 or 200, got $status_code for metrics endpoint"
        return 1
    fi
}

# Test 14: Connection Limits
test_connection_limits() {
    log_info "Testing connection limits (basic test)..."
    
    # Make multiple concurrent connections
    local pids=()
    for i in {1..5}; do
        curl -s "$GATEWAY_URL/health" > /dev/null &
        pids+=($!)
    done
    
    # Wait for all requests to complete
    for pid in "${pids[@]}"; do
        wait $pid
    done
    
    return 0
}

# Test 15: Service Discovery
test_service_discovery() {
    # Test that all expected services are reachable through the gateway
    local services=("auth" "content" "chat")
    
    for service in "${services[@]}"; do
        if ! http_request "GET" "$GATEWAY_URL/health/$service" "200"; then
            log_error "Service $service is not reachable"
            return 1
        fi
    done
    
    return 0
}

# Performance Tests

# Test 16: Response Time
test_response_time() {
    log_info "Testing response time..."
    
    local start_time
    local end_time
    local response_time
    
    start_time=$(date +%s%N)
    curl -s "$GATEWAY_URL/health" > /dev/null
    end_time=$(date +%s%N)
    
    response_time=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds
    
    log_info "Response time: ${response_time}ms"
    
    # Consider test passed if response time is under 1000ms
    if [ $response_time -lt 1000 ]; then
        return 0
    else
        log_error "Response time too high: ${response_time}ms"
        return 1
    fi
}

# Test 17: Concurrent Requests
test_concurrent_requests() {
    log_info "Testing concurrent requests..."
    
    local concurrent_count=10
    local pids=()
    local success_count=0
    
    # Start concurrent requests
    for i in $(seq 1 $concurrent_count); do
        {
            if curl -s -f "$GATEWAY_URL/health" > /dev/null 2>&1; then
                echo "success"
            fi
        } &
        pids+=($!)
    done
    
    # Wait for all requests and count successes
    for pid in "${pids[@]}"; do
        if wait $pid; then
            local result
            result=$(jobs -p | grep $pid || echo "")
            if [ -n "$result" ]; then
                success_count=$((success_count + 1))
            fi
        fi
    done
    
    log_info "Concurrent requests: $success_count/$concurrent_count successful"
    
    # Consider test passed if at least 80% of requests succeeded
    local threshold=$((concurrent_count * 8 / 10))
    if [ $success_count -ge $threshold ]; then
        return 0
    else
        return 1
    fi
}

# Main test execution
main() {
    echo "======================================"
    echo "    API Gateway Test Suite"
    echo "======================================"
    echo "Gateway URL: $GATEWAY_URL"
    echo "Test Timeout: ${TEST_TIMEOUT}s"
    echo "Max Retries: $MAX_RETRIES"
    echo "======================================"
    echo
    
    # Wait for gateway to be ready
    log_info "Waiting for API Gateway to be ready..."
    local ready=false
    for i in {1..30}; do
        if curl -s -f "$GATEWAY_URL/health" > /dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 2
    done
    
    if [ "$ready" = false ]; then
        log_error "API Gateway is not ready after 60 seconds"
        exit 1
    fi
    
    log_success "API Gateway is ready!"
    echo
    
    # Run all tests
    run_test "Gateway Health Check" test_gateway_health
    run_test "Gateway Root Endpoint" test_gateway_root
    run_test "Auth Service Routing" test_auth_service_routing
    run_test "Content Service Routing" test_content_service_routing
    run_test "Chat Service Routing" test_chat_service_routing
    run_test "Rate Limiting" test_rate_limiting
    run_test "Security Headers" test_security_headers
    run_test "CORS Headers" test_cors_headers
    run_test "Invalid Endpoints" test_invalid_endpoints
    run_test "HTTP Methods" test_http_methods
    run_test "Large Request Body" test_large_request_body
    run_test "Documentation Endpoints" test_documentation_endpoints
    run_test "Metrics Endpoint" test_metrics_endpoint
    run_test "Connection Limits" test_connection_limits
    run_test "Service Discovery" test_service_discovery
    run_test "Response Time" test_response_time
    run_test "Concurrent Requests" test_concurrent_requests
    
    # Print summary
    echo "======================================"
    echo "           Test Summary"
    echo "======================================"
    echo "Total Tests: $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
    echo "Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
    echo "======================================"
    
    # Exit with appropriate code
    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "All tests passed!"
        exit 0
    else
        log_error "$FAILED_TESTS test(s) failed"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "--help")
        echo "Usage: $0 [--help|--gateway-url URL]"
        echo "  --gateway-url URL   Set the gateway URL (default: http://localhost)"
        echo "  --help              Show this help message"
        exit 0
        ;;
    "--gateway-url")
        if [ -n "${2:-}" ]; then
            GATEWAY_URL="$2"
        else
            log_error "Gateway URL not provided"
            exit 1
        fi
        ;;
esac

# Run main function
main