---
inclusion: always
---

# Test Quality Standards for All AI-Generated Tests

This steering file ensures AI-generated tests are comprehensive and catch failures. It's automatically included in every test generation context.

## Test Coverage Requirements

- **Minimum line coverage: 80%** (85% for customer-facing, 90% for financial services)
- **Minimum branch coverage: 75%**
- **ALWAYS test error paths, not just happy paths**
- **Pattern**: Comprehensive test suite with happy path, error path, and edge cases

Example:
```typescript
// ✓ CORRECT: Tests for happy path AND error paths
describe('Payment Processing', () => {
  // Happy path
  it('should process valid payment', async () => {
    const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
    const result = await processPayment(payment);
    
    expect(result.success).toBe(true);
    expect(result.chargeId).toMatch(/^ch_/);
  });
  
  // Error paths
  it('should reject invalid card', async () => {
    const payment = { amount: 1000, currency: 'USD', token: 'tok_chargeDeclined' };
    const result = await processPayment(payment);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('card_declined');
  });
  
  it('should handle network timeout', async () => {
    jest.spyOn(stripe.charges, 'create').mockRejectedValue(new Error('Network timeout'));
    
    const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
    const result = await processPayment(payment);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
  
  it('should handle Stripe API failure', async () => {
    jest.spyOn(stripe.charges, 'create').mockRejectedValue(new Error('API error'));
    
    const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
    const result = await processPayment(payment);
    
    expect(result.success).toBe(false);
  });
});

// ✗ WRONG: Only happy path tested
// describe('Payment Processing', () => {
//   it('should process valid payment', async () => {
//     const result = await processPayment({ amount: 1000 });
//     expect(result.success).toBe(true);
//   });
//   // Missing: error cases, edge cases, failure modes
// });
```

## Negative Test Cases (Critical)

- **ALWAYS include tests for what must NOT happen**:
  - "Must NOT log credit card numbers"
  - "Must NOT allow negative amounts"
  - "Must NOT succeed if auth token is invalid"
- **Pattern**: Explicit negative assertions

Example:
```typescript
// ✓ CORRECT: Test what must NOT happen
describe('Payment Logging', () => {
  it('must NOT log credit card numbers', async () => {
    const logSpy = jest.spyOn(logger, 'info');
    
    await processPayment({ card: '4111111111111111', amount: 1000 });
    
    const allLogs = logSpy.mock.calls.map(call => JSON.stringify(call));
    const logsString = allLogs.join(' ');
    
    // Card number must NOT appear in logs
    expect(logsString).not.toContain('4111111111111111');
    
    // Should be masked
    expect(logsString).toContain('****1111');
  });
  
  it('must NOT allow negative amounts', async () => {
    const payment = { amount: -1000, currency: 'USD', token: 'tok_visa' };
    
    await expect(processPayment(payment)).rejects.toThrow('Invalid amount');
  });
  
  it('must NOT succeed if auth token is invalid', async () => {
    const result = await makeAuthenticatedRequest('/api/payments', {
      headers: { Authorization: 'Bearer invalid_token' }
    });
    
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('invalid_token');
  });
});

// ✗ WRONG: No negative test cases
// describe('Payment Processing', () => {
//   it('should process payment', async () => {
//     const result = await processPayment({ amount: 1000 });
//     expect(result.success).toBe(true);
//   });
//   // Missing: tests for what must NOT happen
// });
```

## Edge Cases

- **ALWAYS test boundary conditions**:
  - Empty inputs, null values, undefined
  - Maximum/minimum values
  - Concurrent operations
  - Network failures, timeouts
- **Pattern**: Edge case test suite

Example:
```typescript
// ✓ CORRECT: Comprehensive edge case testing
describe('Rate Limiter Edge Cases', () => {
  it('should handle empty inputs', async () => {
    await expect(rateLimiter.check('')).rejects.toThrow('Invalid identifier');
    await expect(rateLimiter.check(null as any)).rejects.toThrow('Invalid identifier');
    await expect(rateLimiter.check(undefined as any)).rejects.toThrow('Invalid identifier');
  });
  
  it('should handle maximum values', async () => {
    const result = await rateLimiter.check('user-123', 1000000); // 1 million limit
    expect(result.allowed).toBe(true);
  });
  
  it('should handle concurrent rate limit checks', async () => {
    const promises = Array(100).fill(null).map(() => 
      rateLimiter.check('tenant-123')
    );
    
    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;
    
    // Rate limit enforced under concurrency
    expect(allowed).toBeLessThanOrEqual(100);
  });
  
  it('should handle Redis connection failure', async () => {
    jest.spyOn(redis, 'zcount').mockRejectedValue(new Error('Connection refused'));
    
    // Should fail open (allow requests) when Redis is unavailable
    const result = await rateLimiter.check('user-123');
    
    expect(result.allowed).toBe(true);
    expect(result.fallback).toBe(true);
  });
  
  it('should handle slow Redis response', async () => {
    jest.spyOn(redis, 'zcount').mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(0), 200))
    );
    
    const start = Date.now();
    const result = await rateLimiter.check('user-123');
    const duration = Date.now() - start;
    
    // Should use local cache fallback if Redis is slow
    expect(duration).toBeLessThan(150);
  });
});

// ✗ WRONG: No edge case testing
// describe('Rate Limiter', () => {
//   it('should allow requests under limit', async () => {
//     const result = await rateLimiter.check('user-123');
//     expect(result.allowed).toBe(true);
//   });
//   // Missing: empty inputs, max values, concurrency, failures
// });
```

## Test Data

- **NEVER use production data in tests**
- **ALWAYS use synthetic test data**
- **ALWAYS clean up test data after tests run**
- **Pattern**: Test fixtures with cleanup

Example:
```typescript
// ✓ CORRECT: Synthetic test data with cleanup
describe('User Management', () => {
  let testUser: User;
  
  beforeEach(async () => {
    // Create synthetic test data
    testUser = await createTestUser({
      id: `test-${Date.now()}`,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    });
  });
  
  afterEach(async () => {
    // Clean up test data
    if (testUser) {
      await deleteTestUser(testUser.id);
    }
  });
  
  it('should update user profile', async () => {
    const updated = await updateUserProfile(testUser.id, {
      name: 'Updated Name'
    });
    
    expect(updated.name).toBe('Updated Name');
  });
});

// ✗ WRONG: Use production data or no cleanup
// describe('User Management', () => {
//   it('should update user profile', async () => {
//     const updated = await updateUserProfile('real-user-id', { // Production data!
//       name: 'Updated Name'
//     });
//     expect(updated.name).toBe('Updated Name');
//     // No cleanup - leaves test data in database!
//   });
// });
```

## Performance Tests

- **ALWAYS include latency assertions for critical paths**
- **Pattern**: Performance test with p50/p99 measurements

Example:
```typescript
// ✓ CORRECT: Performance test with latency assertions
describe('Rate Limiter Performance', () => {
  it('should complete under 50ms at p99', async () => {
    const latencies: number[] = [];
    
    // Collect 100 samples
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await rateLimiter.check('user-123');
      latencies.push(Date.now() - start);
    }
    
    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[49];
    const p99 = latencies[98];
    
    expect(p50).toBeLessThan(10); // P50 < 10ms
    expect(p99).toBeLessThan(50); // P99 < 50ms
  });
  
  it('should handle 10,000 requests per second', async () => {
    const start = Date.now();
    const requests = 10000;
    
    // Fire concurrent requests
    const promises = Array(requests).fill(null).map(() =>
      rateLimiter.check(`user-${Math.random()}`)
    );
    
    await Promise.all(promises);
    const duration = (Date.now() - start) / 1000; // seconds
    const throughput = requests / duration;
    
    expect(throughput).toBeGreaterThan(10000);
  });
});

// ✗ WRONG: No performance testing
// describe('Rate Limiter', () => {
//   it('should check rate limit', async () => {
//     const result = await rateLimiter.check('user-123');
//     expect(result.allowed).toBe(true);
//   });
//   // Missing: latency and throughput tests
// });
```

## Integration Tests

- **ALWAYS test external service integrations**
- **ALWAYS use test mode/sandbox for third-party APIs**
- **ALWAYS test failure scenarios (network errors, API errors)**
- **Pattern**: Integration tests with real external services (test mode)

Example:
```typescript
// ✓ CORRECT: Integration tests with Stripe test mode
describe('Stripe Integration', () => {
  const stripe = new Stripe(process.env.STRIPE_TEST_KEY!, {
    apiVersion: '2023-10-16'
  });
  
  it('should create charge in Stripe test mode', async () => {
    const charge = await stripe.charges.create({
      amount: 1000,
      currency: 'usd',
      source: 'tok_visa', // Stripe test token
      description: 'Test charge'
    });
    
    expect(charge.id).toMatch(/^ch_/);
    expect(charge.status).toBe('succeeded');
    expect(charge.amount).toBe(1000);
  });
  
  it('should handle declined card', async () => {
    await expect(
      stripe.charges.create({
        amount: 1000,
        currency: 'usd',
        source: 'tok_chargeDeclined', // Stripe test token for declined
        description: 'Test charge'
      })
    ).rejects.toThrow(/card was declined/);
  });
  
  it('should handle insufficient funds', async () => {
    await expect(
      stripe.charges.create({
        amount: 1000,
        currency: 'usd',
        source: 'tok_chargeDeclinedInsufficientFunds',
        description: 'Test charge'
      })
    ).rejects.toThrow(/insufficient funds/);
  });
});

// ✗ WRONG: Mock everything, no real integration testing
// describe('Stripe Integration', () => {
//   it('should create charge', async () => {
//     jest.spyOn(stripe.charges, 'create').mockResolvedValue({ id: 'ch_123' } as any);
//     const charge = await stripe.charges.create({ amount: 1000 });
//     expect(charge.id).toBe('ch_123');
//     // Not testing real Stripe integration!
//   });
// });
```

## Test Organization

- **ALWAYS group related tests with describe blocks**
- **ALWAYS use clear, descriptive test names**
- **ALWAYS follow AAA pattern**: Arrange, Act, Assert
- **Pattern**: Well-organized test suites

Example:
```typescript
// ✓ CORRECT: Well-organized tests with clear names
describe('PaymentService', () => {
  describe('processPayment', () => {
    describe('when payment is valid', () => {
      it('should create charge in Stripe', async () => {
        // Arrange
        const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
        
        // Act
        const result = await paymentService.processPayment(payment);
        
        // Assert
        expect(result.success).toBe(true);
        expect(result.chargeId).toBeDefined();
      });
      
      it('should save payment record to database', async () => {
        const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
        const result = await paymentService.processPayment(payment);
        
        const saved = await db.getPayment(result.paymentId);
        expect(saved).toBeDefined();
        expect(saved.amount).toBe(1000);
      });
    });
    
    describe('when payment is invalid', () => {
      it('should reject negative amounts', async () => {
        const payment = { amount: -1000, currency: 'USD', token: 'tok_visa' };
        
        await expect(
          paymentService.processPayment(payment)
        ).rejects.toThrow('Invalid amount');
      });
      
      it('should reject invalid currency codes', async () => {
        const payment = { amount: 1000, currency: 'INVALID', token: 'tok_visa' };
        
        await expect(
          paymentService.processPayment(payment)
        ).rejects.toThrow('Invalid currency');
      });
    });
  });
});

// ✗ WRONG: Flat structure with unclear test names
// describe('Tests', () => {
//   it('test1', async () => { /* ... */ });
//   it('test2', async () => { /* ... */ });
//   it('test3', async () => { /* ... */ });
//   // Unclear what's being tested
// });
```

## Mocking Best Practices

- **ALWAYS mock external dependencies for unit tests**
- **ALWAYS verify mock calls and arguments**
- **NEVER mock the code under test**
- **Pattern**: Dependency injection with mocked dependencies

Example:
```typescript
// ✓ CORRECT: Mock external dependencies
describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockStripe: jest.Mocked<StripeClient>;
  let mockDb: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;
  
  beforeEach(() => {
    mockStripe = {
      charges: {
        create: jest.fn().mockResolvedValue({ id: 'ch_123', status: 'succeeded' })
      }
    } as any;
    
    mockDb = {
      savePayment: jest.fn().mockResolvedValue(undefined)
    } as any;
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn()
    } as any;
    
    paymentService = new PaymentService(mockStripe, mockDb, mockLogger);
  });
  
  it('should call Stripe with correct parameters', async () => {
    const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
    
    await paymentService.processPayment(payment);
    
    expect(mockStripe.charges.create).toHaveBeenCalledWith({
      amount: 1000,
      currency: 'USD',
      source: 'tok_visa'
    });
  });
  
  it('should save payment to database', async () => {
    const payment = { amount: 1000, currency: 'USD', token: 'tok_visa' };
    
    await paymentService.processPayment(payment);
    
    expect(mockDb.savePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        chargeId: 'ch_123'
      })
    );
  });
});

// ✗ WRONG: Test relies on real external services
// describe('PaymentService', () => {
//   it('should process payment', async () => {
//     const service = new PaymentService(); // Creates real Stripe client!
//     const result = await service.processPayment({ amount: 1000 });
//     expect(result.success).toBe(true);
//     // Slow, flaky, costs money, not a unit test!
//   });
// });
```

## Coverage by Risk Level

Configure coverage requirements based on service criticality:

| Service Type | Line Coverage | Branch Coverage | Rationale |
|--------------|---------------|-----------------|-----------|
| Payment/financial | ≥ 90% | ≥ 85% | High risk, regulatory scrutiny |
| Customer-facing API | ≥ 85% | ≥ 80% | User impact, reputation risk |
| Internal services | ≥ 80% | ≥ 75% | Lower risk, faster iteration |
| Experimental/POC | ≥ 70% | ≥ 65% | Learning phase, acceptable gaps |

## Impact

When AI follows these test requirements:
- **Coverage**: 85%+ line coverage, 80%+ branch coverage automatically
- **Quality**: Negative test cases prevent "happy path only" testing
- **Edge Cases**: Boundary conditions and failures tested systematically
- **Performance**: Latency constraints validated in tests
- **Confidence**: Comprehensive tests enable safe refactoring

**Measured outcomes** (from tactical guide):
- Test-related production incidents: 70% reduction
- Confidence in AI-generated code: 30% → 85%
- "Tests pass but production fails": 70% reduction
- Mutation testing survival rate: <10% (high test quality)
