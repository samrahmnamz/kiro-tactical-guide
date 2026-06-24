/**
 * Bulkhead Isolation
 *
 * Limits concurrent requests to each dependency via isolated connection pools.
 * Prevents one slow dependency from exhausting resources needed by others.
 *
 * Analogy: Ship bulkheads — a breach in one compartment doesn't sink the ship.
 *
 * Without bulkhead: Payment gateway slow → all 100 connections used for payment
 *                   → no connections for inventory → entire service down
 *
 * With bulkhead: Payment gateway slow → only its 20 connections used
 *               → inventory still has its own 15 connections → partial availability
 */

import http from 'http';
import https from 'https';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../logger';

export interface BulkheadConfig {
  name: string;
  baseURL: string;
  maxConnections: number;
  timeoutMs: number;
  keepAlive?: boolean;
}

/**
 * Create an isolated HTTP client with its own connection pool.
 * Each dependency gets a separate pool that cannot be exhausted by others.
 */
export function createIsolatedClient(config: BulkheadConfig): AxiosInstance {
  const agent = new https.Agent({
    maxSockets: config.maxConnections,
    maxFreeSockets: Math.floor(config.maxConnections / 2),
    keepAlive: config.keepAlive ?? true,
    keepAliveMsecs: 30000,
    timeout: config.timeoutMs,
  });

  const httpAgent = new http.Agent({
    maxSockets: config.maxConnections,
    maxFreeSockets: Math.floor(config.maxConnections / 2),
    keepAlive: config.keepAlive ?? true,
    keepAliveMsecs: 30000,
    timeout: config.timeoutMs,
  });

  const client = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    httpsAgent: agent,
    httpAgent: httpAgent,
    // Reject only network errors, let caller handle HTTP status codes
    validateStatus: () => true,
  });

  // Log when pool is near capacity
  client.interceptors.request.use((requestConfig) => {
    const sockets = agent.sockets;
    const totalActive = Object.values(sockets).reduce(
      (sum, arr) => sum + (arr?.length ?? 0),
      0
    );

    if (totalActive >= config.maxConnections * 0.8) {
      logger.warn(`Bulkhead ${config.name}: pool at ${totalActive}/${config.maxConnections} capacity`, {
        dependency: config.name,
        activeConnections: totalActive,
        maxConnections: config.maxConnections,
      });
    }

    return requestConfig;
  });

  return client;
}

/**
 * Semaphore-based concurrency limiter for non-HTTP dependencies.
 * Use for database pools, Redis, gRPC, etc.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly name: string,
    private readonly maxConcurrent: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }

    // Queue the request — will be released when a slot opens
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift()!;
      next();
    }
  }

  getStats(): { active: number; queued: number; max: number } {
    return {
      active: this.active,
      queued: this.queue.length,
      max: this.maxConcurrent,
    };
  }
}
