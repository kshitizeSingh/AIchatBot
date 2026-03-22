#!/bin/bash

# Load Testing Script for API Gateway
# Tests performance under various load conditions

set -e

# Configuration
GATEWAY_URL="http://localhost"
TEST_DURATION=60  # seconds
CONCURRENT_USERS=10
REQUESTS_PER_SECOND=5
TEST_ENDPOINTS=(
    "/health"
    "/v1/auth/health"
    "/v1/documents/health"
    "/v1/chat/health"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required tools are available
check_dependencies() {
    local missing_tools=()
    
    if ! command -v curl &> /dev/null; then
        missing_tools+=("curl")
    fi
    
    if ! command -v bc &> /dev/null; then
        missing_tools+=("bc")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Please install the missing tools and try again"
        exit 1
    fi
}

# Single request test
single_request_test() {
    local endpoint="$1"
    local start_time
    local end_time
    local response_time
    local status_code
    
    start_time=$(date +%s%N)
    status_code=$(curl -s -w '%{http_code}' -o /dev/null "$GATEWAY_URL$endpoint" 2>/dev/null || echo "000")
    end_time=$(date +%s%N)
    
    response_time=$(echo "scale=2; ($end_time - $start_time) / 1000000" | bc)  # Convert to milliseconds
    
    echo "$status_code,$response_time"
}

# Concurrent load test
concurrent_load_test() {
    local endpoint="$1"
    local duration="$2"
    local concurrent_users="$3"
    local requests_per_second="$4"
    
    log_info "Starting load test for $endpoint"
    log_info "Duration: ${duration}s, Users: $concurrent_users, RPS: $requests_per_second"
    
    local results_file="/tmp/load_test_results_$(date +%s).txt"
    local pids=()
    local total_requests=0
    local successful_requests=0
    local failed_requests=0
    local total_response_time=0
    local min_response_time=999999
    local max_response_time=0
    
    # Start concurrent users
    for i in $(seq 1 $concurrent_users); do
        {
            local user_requests=0
            local user_successful=0
            local user_failed=0
            local user_total_time=0
            
            local end_time=$(($(date +%s) + duration))
            
            while [ $(date +%s) -lt $end_time ]; do
                local result
                result=$(single_request_test "$endpoint")
                local status_code="${result%,*}"
                local response_time="${result#*,}"
                
                user_requests=$((user_requests + 1))
                
                if [ "$status_code" = "200" ]; then
                    user_successful=$((user_successful + 1))
                    user_total_time=$(echo "$user_total_time + $response_time" | bc)
                    
                    # Update min/max response times
                    if (( $(echo "$response_time < $min_response_time" | bc -l) )); then
                        min_response_time="$response_time"
                    fi
                    if (( $(echo "$response_time > $max_response_time" | bc -l) )); then
                        max_response_time="$response_time"
                    fi
                else
                    user_failed=$((user_failed + 1))
                fi
                
                # Rate limiting
                if [ $requests_per_second -gt 0 ]; then
                    sleep $(echo "scale=2; 1 / $requests_per_second" | bc)
                fi
            done
            
            echo "$user_requests,$user_successful,$user_failed,$user_total_time" >> "$results_file"
        } &
        pids+=($!)
    done
    
    # Wait for all users to complete
    for pid in "${pids[@]}"; do
        wait $pid
    done
    
    # Aggregate results
    while IFS=',' read -r requests successful failed response_time; do
        total_requests=$((total_requests + requests))
        successful_requests=$((successful_requests + successful))
        failed_requests=$((failed_requests + failed))
        total_response_time=$(echo "$total_response_time + $response_time" | bc)
    done < "$results_file"
    
    # Calculate metrics
    local success_rate
    local avg_response_time
    local throughput
    
    if [ $total_requests -gt 0 ]; then
        success_rate=$(echo "scale=2; $successful_requests * 100 / $total_requests" | bc)
        throughput=$(echo "scale=2; $total_requests / $duration" | bc)
    else
        success_rate=0
        throughput=0
    fi
    
    if [ $successful_requests -gt 0 ]; then
        avg_response_time=$(echo "scale=2; $total_response_time / $successful_requests" | bc)
    else
        avg_response_time=0
    fi
    
    # Print results
    echo "======================================"
    echo "Load Test Results for $endpoint"
    echo "======================================"
    echo "Test Duration: ${duration}s"
    echo "Concurrent Users: $concurrent_users"
    echo "Total Requests: $total_requests"
    echo "Successful Requests: $successful_requests"
    echo "Failed Requests: $failed_requests"
    echo "Success Rate: ${success_rate}%"
    echo "Throughput: ${throughput} req/s"
    echo "Avg Response Time: ${avg_response_time}ms"
    echo "Min Response Time: ${min_response_time}ms"
    echo "Max Response Time: ${max_response_time}ms"
    echo "======================================"
    echo
    
    # Cleanup
    rm -f "$results_file"
    
    # Return success if success rate is above 95%
    if (( $(echo "$success_rate >= 95" | bc -l) )); then
        return 0
    else
        return 1
    fi
}

# Stress test - gradually increase load
stress_test() {
    log_info "Starting stress test..."
    
    local endpoint="/health"
    local base_users=5
    local max_users=50
    local step=5
    local test_duration=30
    
    echo "======================================"
    echo "           Stress Test Results"
    echo "======================================"
    printf "%-10s %-15s %-15s %-15s %-15s\n" "Users" "Total Req" "Success Rate" "Avg RT (ms)" "Throughput"
    echo "----------------------------------------------------------------------"
    
    for users in $(seq $base_users $step $max_users); do
        local results_file="/tmp/stress_test_$(date +%s).txt"
        local pids=()
        local total_requests=0
        local successful_requests=0
        local total_response_time=0
        
        # Start concurrent users
        for i in $(seq 1 $users); do
            {
                local user_requests=0
                local user_successful=0
                local user_total_time=0
                
                local end_time=$(($(date +%s) + test_duration))
                
                while [ $(date +%s) -lt $end_time ]; do
                    local result
                    result=$(single_request_test "$endpoint")
                    local status_code="${result%,*}"
                    local response_time="${result#*,}"
                    
                    user_requests=$((user_requests + 1))
                    
                    if [ "$status_code" = "200" ]; then
                        user_successful=$((user_successful + 1))
                        user_total_time=$(echo "$user_total_time + $response_time" | bc)
                    fi
                    
                    sleep 0.1  # Small delay to prevent overwhelming
                done
                
                echo "$user_requests,$user_successful,$user_total_time" >> "$results_file"
            } &
            pids+=($!)
        done
        
        # Wait for all users to complete
        for pid in "${pids[@]}"; do
            wait $pid
        done
        
        # Aggregate results
        while IFS=',' read -r requests successful response_time; do
            total_requests=$((total_requests + requests))
            successful_requests=$((successful_requests + successful))
            total_response_time=$(echo "$total_response_time + $response_time" | bc)
        done < "$results_file"
        
        # Calculate metrics
        local success_rate
        local avg_response_time
        local throughput
        
        if [ $total_requests -gt 0 ]; then
            success_rate=$(echo "scale=1; $successful_requests * 100 / $total_requests" | bc)
            throughput=$(echo "scale=1; $total_requests / $test_duration" | bc)
        else
            success_rate=0
            throughput=0
        fi
        
        if [ $successful_requests -gt 0 ]; then
            avg_response_time=$(echo "scale=1; $total_response_time / $successful_requests" | bc)
        else
            avg_response_time=0
        fi
        
        printf "%-10s %-15s %-15s %-15s %-15s\n" "$users" "$total_requests" "${success_rate}%" "$avg_response_time" "$throughput"
        
        # Cleanup
        rm -f "$results_file"
        
        # Break if success rate drops below 80%
        if (( $(echo "$success_rate < 80" | bc -l) )); then
            log_warning "Success rate dropped below 80% at $users concurrent users"
            break
        fi
        
        sleep 2  # Brief pause between stress levels
    done
    
    echo "======================================"
}

# Spike test - sudden load increase
spike_test() {
    log_info "Starting spike test..."
    
    local endpoint="/health"
    local normal_users=5
    local spike_users=30
    local normal_duration=20
    local spike_duration=10
    local recovery_duration=20
    
    echo "======================================"
    echo "             Spike Test"
    echo "======================================"
    
    # Phase 1: Normal load
    log_info "Phase 1: Normal load ($normal_users users for ${normal_duration}s)"
    concurrent_load_test "$endpoint" $normal_duration $normal_users 2
    
    # Phase 2: Spike load
    log_info "Phase 2: Spike load ($spike_users users for ${spike_duration}s)"
    concurrent_load_test "$endpoint" $spike_duration $spike_users 5
    
    # Phase 3: Recovery
    log_info "Phase 3: Recovery ($normal_users users for ${recovery_duration}s)"
    concurrent_load_test "$endpoint" $recovery_duration $normal_users 2
    
    echo "Spike test completed"
}

# Endurance test - sustained load
endurance_test() {
    log_info "Starting endurance test..."
    
    local endpoint="/health"
    local users=10
    local duration=300  # 5 minutes
    
    echo "======================================"
    echo "           Endurance Test"
    echo "======================================"
    
    concurrent_load_test "$endpoint" $duration $users 3
}

# Main function
main() {
    echo "======================================"
    echo "    API Gateway Load Testing Suite"
    echo "======================================"
    echo "Gateway URL: $GATEWAY_URL"
    echo "======================================"
    echo
    
    # Check dependencies
    check_dependencies
    
    # Wait for gateway to be ready
    log_info "Checking if API Gateway is ready..."
    if ! curl -s -f "$GATEWAY_URL/health" > /dev/null 2>&1; then
        log_error "API Gateway is not ready. Please start the gateway first."
        exit 1
    fi
    log_success "API Gateway is ready!"
    echo
    
    # Run load tests for each endpoint
    local failed_tests=0
    
    for endpoint in "${TEST_ENDPOINTS[@]}"; do
        if ! concurrent_load_test "$endpoint" $TEST_DURATION $CONCURRENT_USERS $REQUESTS_PER_SECOND; then
            failed_tests=$((failed_tests + 1))
        fi
        sleep 5  # Brief pause between tests
    done
    
    # Run stress test
    stress_test
    
    # Run spike test
    spike_test
    
    # Optionally run endurance test
    if [ "${RUN_ENDURANCE:-}" = "true" ]; then
        endurance_test
    else
        log_info "Skipping endurance test (set RUN_ENDURANCE=true to enable)"
    fi
    
    # Summary
    echo "======================================"
    echo "         Load Testing Summary"
    echo "======================================"
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All load tests passed!"
        exit 0
    else
        log_error "$failed_tests load test(s) failed"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "--help")
        echo "Usage: $0 [options]"
        echo "Options:"
        echo "  --gateway-url URL       Set the gateway URL (default: http://localhost)"
        echo "  --duration SECONDS      Set test duration (default: 60)"
        echo "  --users NUMBER          Set concurrent users (default: 10)"
        echo "  --rps NUMBER            Set requests per second (default: 5)"
        echo "  --endurance             Run endurance test (5 minutes)"
        echo "  --help                  Show this help message"
        echo
        echo "Environment variables:"
        echo "  RUN_ENDURANCE=true      Enable endurance test"
        exit 0
        ;;
    "--gateway-url")
        GATEWAY_URL="$2"
        shift 2
        ;;
    "--duration")
        TEST_DURATION="$2"
        shift 2
        ;;
    "--users")
        CONCURRENT_USERS="$2"
        shift 2
        ;;
    "--rps")
        REQUESTS_PER_SECOND="$2"
        shift 2
        ;;
    "--endurance")
        export RUN_ENDURANCE=true
        shift
        ;;
esac

# Run main function
main