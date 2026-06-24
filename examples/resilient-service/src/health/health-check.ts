/**
 * Health Check Endpoint
 *
 * Reports dependency health and circuit breaker states.
 * Used by load balancers, orchestrators, and monitoring systems.
 *
 * Endpoints:
 * - GET /health/live → 200 if process running (no dep checks)
 * - GET /health/ready → 200 if critical deps reachable
 * - GET /health/dependencies → detailed dep status with circuit states
 */

import { Request, Response } from 'express';
import { getAllCircuitStates } from '../resilience/circuit-breaker';
import { DependencyHealth } from '../types';

/**
 * Liveness check: is the process running?
 * Always returns 200 unless the process is dead.
 */
export function livenessHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
}

/**
 * Readiness check: can the service handle traffic?
 * Returns 503 if critical dependencies are unreachable.
 */
export function readinessHandler(_req: Request, res: Response): void {
  const circuitStates = getAllCircuitStates();

  // Critical dependencies that must be healthy for readiness
  const criticalDeps = ['payment-gateway', 'inventory-service'];

  const criticalOpen = circuitStates.filter(
    (s) => criticalDeps.includes(s.name) && s.state === 'open'
  );

  if (criticalOpen.length > 0) {
    res.status(503).json({
      status: 'not_ready',
      reason: `Critical circuits open: ${criticalOpen.map((s) => s.name).join(', ')}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
}

/**
 * Dependency health: detailed status of all dependencies.
 * Includes circuit breaker states, failure counts, and latency.
 */
export function dependencyHealthHandler(_req: Request, res: Response): void {
  const circuitStates = getAllCircuitStates();

  const dependencies: DependencyHealth[] = circuitStates.map((circuit) => ({
    name: circuit.name,
    status: circuit.state === 'open' ? 'unhealthy' : 'healthy',
    latencyMs: null, // Would be populated by actual health pings
    circuitState: circuit.state,
    lastFailure: null,
    failureCount: circuit.stats.failures,
  }));

  const allHealthy = dependencies.every((d) => d.status === 'healthy');
  const overallStatus = allHealthy ? 'healthy' : 'degraded';

  res.status(allHealthy ? 200 : 503).json({
    status: overallStatus,
    dependencies,
    timestamp: new Date().toISOString(),
  });
}
