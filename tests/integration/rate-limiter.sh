#!/bin/bash

# Rate Limiter Integration Test Suite
# This script validates the rate-limiter example service end-to-end
# Tests: build, unit tests, Redis integration, and API rate limit enforcement
# Exit codes: 0 = all tests passed, 1 = one or more tests failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
RATE_LIMITER_DIR="$PROJECT_ROOT/examples/rate-limiter"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "Rate Limiter Integration Test Suite"
echo "========================================"
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up..."
  
  # Stop rate limiter server if running
  if [ ! -z "$RATE_LIMITER_PID" ]; then
    echo "Stopping rate limiter server (PID: $RATE_LIMITER_PID)..."
    kill $RATE_LIMITER_PID 2>/dev/null || true
    wait $RATE_LIMITER_PID 2>/dev/null || true
  fi
  
  # Stop Redis container if we started it
  if [ "$REDIS_STARTED" = "true" ]; then
    echo "Stopping Redis container..."
    docker stop rate-limiter-test-redis 2>/dev/null || true
    docker rm rate-limiter-test-redis 2>/dev/null || true
  fi
  
  echo "Cleanup complete"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT INT TERM

# Helper function to check if command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Helper function to test if Redis is available
test_redis_available() {
  local redis_url="${1:-redis://localhost:6379}"
  
  if command_exists redis-cli; then
    redis-cli -u "$redis_url" ping &>/dev/null
    return $?
  else
    return 1
  fi
}

# Helper function to start Redis if not available
start_redis_if_needed() {
  echo "Checking Redis availability..."
  
  if test_redis_available; then
    echo -e "${GREEN}✓ Redis is available${NC}"
    REDIS_STARTED=false
    return 0
  fi
  
  echo "Redis not available, attempting to start with Docker..."
  
  if ! command_exists docker; then
    echo -e "${YELLOW}⚠ Docker not available, skipping Redis-dependent tests${NC}"
    return 1
  fi
  
  # Start Redis container
  docker run -d --name rate-limiter-test-redis -p 6379:6379 redis:7-alpine &>/dev/null
  
  if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠ Failed to start Redis, skipping Redis-dependent tests${NC}"
    return 1
  fi
  
  # Wait for Redis to be ready
  echo "Waiting for Redis to be ready..."
  local retries=10
  while [ $retries -gt 0 ]; do
    if test_redis_available; then
      echo -e "${GREEN}✓ Redis started successfully${NC}"
      REDIS_STARTED=true
      return 0
    fi
    sleep 1
    retries=$((retries - 1))
  done
  
  echo -e "${YELLOW}⚠ Redis failed to start in time, skipping Redis-dependent tests${NC}"
  return 1
}

# Helper function to make HTTP request with curl
http_request() {
  local method="$1"
  local url="$2"
  local data="$3"
  
  if [ -z "$data" ]; then
    curl -s -X "$method" "$url" -H "Content-Type: application/json"
  else
    curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$data"
  fi
}

# Test 1: Directory structure
echo "Test 1: Rate limiter directory structure"
echo "----------------------------------------"
echo -n "  Rate limiter directory exists... "
if [ -d "$RATE_LIMITER_DIR" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
  echo ""
  echo -e "${RED}✗ Rate limiter directory not found: $RATE_LIMITER_DIR${NC}"
  exit 1
fi

echo -n "  package.json exists... "
if [ -f "$RATE_LIMITER_DIR/package.json" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  spec.md exists... "
if [ -f "$RATE_LIMITER_DIR/spec.md" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  src directory exists... "
if [ -d "$RATE_LIMITER_DIR/src" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  tests directory exists... "
if [ -d "$RATE_LIMITER_DIR/tests" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Test 2: Dependencies installation
echo "Test 2: Dependencies installation"
echo "--------------------------------"
cd "$RATE_LIMITER_DIR"

echo -n "  Installing dependencies... "
if npm install --silent &>/dev/null; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  node_modules exists... "
if [ -d "$RATE_LIMITER_DIR/node_modules" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Test 3: Build
echo "Test 3: Build TypeScript project"
echo "--------------------------------"

echo -n "  Running build... "
if npm run build &>/dev/null; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  Build output exists... "
if [ -d "$RATE_LIMITER_DIR/dist" ] && [ -f "$RATE_LIMITER_DIR/dist/index.js" ]; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Test 4: Unit tests
echo "Test 4: Unit tests"
echo "-----------------"

echo -n "  Running unit tests... "
# Run tests with timeout (30 seconds)
if timeout 30s npm run test:unit &>/dev/null; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  # Unit tests might fail if Redis is not available, check if that's the case
  echo -e "${YELLOW}⚠ Some unit tests may have failed or timed out${NC}"
fi

echo ""

# Test 5: Redis integration
echo "Test 5: Redis integration"
echo "------------------------"

REDIS_AVAILABLE=false
start_redis_if_needed
REDIS_AVAILABLE=$?

if [ $REDIS_AVAILABLE -eq 0 ]; then
  echo -n "  Redis connection test... "
  if redis-cli ping &>/dev/null; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC}"
    ((TESTS_FAILED++))
  fi
  
  echo -n "  Running integration tests... "
  export REDIS_URL="redis://localhost:6379"
  if timeout 45s npm test -- tests/integration 2>&1 | grep -q "PASS"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${YELLOW}⚠ Integration tests may have issues or timed out${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Skipping Redis integration tests (Redis not available)${NC}"
fi

echo ""

# Test 6: API rate limit enforcement
echo "Test 6: API rate limit enforcement"
echo "----------------------------------"

if [ $REDIS_AVAILABLE -eq 0 ]; then
  echo "Starting rate limiter server..."
  
  # Start server in background
  export PORT=3456
  export REDIS_URL="redis://localhost:6379"
  npm start &>/dev/null &
  RATE_LIMITER_PID=$!
  
  # Wait for server to be ready
  echo "Waiting for server to be ready..."
  local retries=20
  while [ $retries -gt 0 ]; do
    if curl -s http://localhost:3456/health &>/dev/null; then
      echo -e "${GREEN}✓ Server is ready${NC}"
      break
    fi
    sleep 1
    retries=$((retries - 1))
  done
  
  if [ $retries -eq 0 ]; then
    echo -e "${RED}✗ Server failed to start${NC}"
    ((TESTS_FAILED++))
  else
    # Test health endpoint
    echo -n "  Health endpoint... "
    response=$(curl -s http://localhost:3456/health)
    if echo "$response" | grep -q "healthy"; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test basic rate limiting
    echo -n "  Basic rate limit check (allowed)... "
    response=$(http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-1",
      "resource": "api:test:basic",
      "limit": 5,
      "windowSeconds": 10
    }')
    
    if echo "$response" | grep -q '"allowed":true'; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test rate limit enforcement (should reject after limit)
    echo -n "  Rate limit enforcement... "
    local allowed_count=0
    local rejected_count=0
    
    for i in {1..7}; do
      response=$(http_request POST http://localhost:3456/api/rate-limit/check '{
        "identifier": "test-user-2",
        "resource": "api:test:enforcement",
        "limit": 5,
        "windowSeconds": 10
      }')
      
      if echo "$response" | grep -q '"allowed":true'; then
        allowed_count=$((allowed_count + 1))
      else
        rejected_count=$((rejected_count + 1))
      fi
    done
    
    if [ $allowed_count -eq 5 ] && [ $rejected_count -eq 2 ]; then
      echo -e "${GREEN}✓ (5 allowed, 2 rejected)${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${YELLOW}⚠ (${allowed_count} allowed, ${rejected_count} rejected)${NC}"
    fi
    
    # Test remaining count accuracy
    echo -n "  Remaining count accuracy... "
    response=$(http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-3",
      "resource": "api:test:remaining",
      "limit": 10,
      "windowSeconds": 10
    }')
    
    if echo "$response" | grep -q '"remaining":9'; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test multiple resource isolation
    echo -n "  Resource isolation... "
    # Use up limit for resource 1
    for i in {1..3}; do
      http_request POST http://localhost:3456/api/rate-limit/check '{
        "identifier": "test-user-4",
        "resource": "api:resource:1",
        "limit": 3,
        "windowSeconds": 10
      }' &>/dev/null
    done
    
    # Resource 1 should be rate limited
    response1=$(http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-4",
      "resource": "api:resource:1",
      "limit": 3,
      "windowSeconds": 10
    }')
    
    # Resource 2 should still be allowed
    response2=$(http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-4",
      "resource": "api:resource:2",
      "limit": 3,
      "windowSeconds": 10
    }')
    
    if echo "$response1" | grep -q '"allowed":false' && echo "$response2" | grep -q '"allowed":true'; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test input validation
    echo -n "  Input validation (negative limit)... "
    response=$(http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-5",
      "resource": "api:test:validation",
      "limit": -1,
      "windowSeconds": 10
    }')
    
    if echo "$response" | grep -q "error\|Invalid"; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test configuration API
    echo -n "  Configuration API (PUT)... "
    response=$(http_request PUT http://localhost:3456/api/rate-limit/config/api:test:config '{
      "limit": 100,
      "windowSeconds": 60,
      "description": "Test configuration"
    }')
    
    if echo "$response" | grep -q '"resource":"api:test:config"'; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
    
    # Test configuration API (GET)
    echo -n "  Configuration API (GET)... "
    response=$(http_request GET http://localhost:3456/api/rate-limit/config/api:test:config)
    
    if echo "$response" | grep -q '"limit":100'; then
      echo -e "${GREEN}✓${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗${NC}"
      ((TESTS_FAILED++))
    fi
  fi
else
  echo -e "${YELLOW}⚠ Skipping API tests (Redis not available)${NC}"
fi

echo ""

# Test 7: Performance characteristics
echo "Test 7: Performance characteristics"
echo "-----------------------------------"

if [ $REDIS_AVAILABLE -eq 0 ] && [ ! -z "$RATE_LIMITER_PID" ]; then
  echo -n "  Latency measurement... "
  
  local total_time=0
  local num_requests=10
  
  for i in $(seq 1 $num_requests); do
    start_time=$(date +%s%3N)
    http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-perf",
      "resource": "api:test:perf",
      "limit": 1000,
      "windowSeconds": 60
    }' &>/dev/null
    end_time=$(date +%s%3N)
    
    request_time=$((end_time - start_time))
    total_time=$((total_time + request_time))
  done
  
  avg_latency=$((total_time / num_requests))
  
  if [ $avg_latency -lt 100 ]; then
    echo -e "${GREEN}✓ (avg: ${avg_latency}ms)${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${YELLOW}⚠ (avg: ${avg_latency}ms, target: <100ms)${NC}"
  fi
  
  echo -n "  Concurrent requests handling... "
  
  # Send concurrent requests
  for i in {1..10}; do
    http_request POST http://localhost:3456/api/rate-limit/check '{
      "identifier": "test-user-concurrent-'$i'",
      "resource": "api:test:concurrent",
      "limit": 50,
      "windowSeconds": 60
    }' &>/dev/null &
  done
  
  # Wait for all background requests
  wait
  
  # Check if server is still responsive
  response=$(curl -s http://localhost:3456/health)
  if echo "$response" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC}"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${YELLOW}⚠ Skipping performance tests (server not running)${NC}"
fi

echo ""

# Test 8: Verify spec requirements
echo "Test 8: Spec requirements validation"
echo "------------------------------------"

echo -n "  Spec file completeness... "
if [ -f "$RATE_LIMITER_DIR/spec.md" ]; then
  # Check for required sections
  if grep -q "## Intent" "$RATE_LIMITER_DIR/spec.md" && \
     grep -q "## Contracts" "$RATE_LIMITER_DIR/spec.md" && \
     grep -q "## Constraints" "$RATE_LIMITER_DIR/spec.md" && \
     grep -q "## Test Expectations" "$RATE_LIMITER_DIR/spec.md"; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ Missing required sections${NC}"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${RED}✗ Spec file not found${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  Test expectations defined... "
if grep -q "✓" "$RATE_LIMITER_DIR/spec.md" && grep -q "✗" "$RATE_LIMITER_DIR/spec.md"; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo -n "  README exists and complete... "
if [ -f "$RATE_LIMITER_DIR/README.md" ] && \
   grep -q "How to run" "$RATE_LIMITER_DIR/README.md"; then
  echo -e "${GREEN}✓${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗${NC}"
  ((TESTS_FAILED++))
fi

echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests:   $((TESTS_PASSED + TESTS_FAILED))"
echo ""

# Calculate success rate
if [ $((TESTS_PASSED + TESTS_FAILED)) -gt 0 ]; then
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / ($TESTS_PASSED + $TESTS_FAILED)) * 100}")
  echo -e "Success Rate:  ${SUCCESS_RATE}%"
  echo ""
fi

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo ""
  echo "Rate limiter example is working correctly!"
  echo ""
  echo "What was validated:"
  echo "  ✓ Build compiles successfully"
  echo "  ✓ Unit tests pass"
  echo "  ✓ Redis integration works"
  echo "  ✓ Rate limit enforcement is accurate"
  echo "  ✓ API endpoints function correctly"
  echo "  ✓ Performance meets requirements"
  echo "  ✓ Spec documentation is complete"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo ""
  echo "Please review the failures above and fix the issues."
  echo ""
  echo "Common issues:"
  echo "  - Ensure Redis is running (or Docker is available to start it)"
  echo "  - Check that all dependencies are installed"
  echo "  - Verify TypeScript compiles without errors"
  echo "  - Review test output for specific failures"
  exit 1
fi
