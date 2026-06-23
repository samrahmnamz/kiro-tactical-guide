/**
 * Rate Limiter Express Server
 * 
 * Provides REST API for rate limit checking and configuration
 */

import express, { Request, Response, NextFunction } from 'express';
import { RateLimiter } from './rate-limiter';
import {
  RateLimitCheckRequest,
  RateLimitConfig,
  RateLimitConfigUpdateRequest,
} from './types';
import pino from 'pino';

const logger = pino({ name: 'rate-limiter-server' });

// Environment configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize rate limiter
const rateLimiter = new RateLimiter({
  redis: {
    url: REDIS_URL,
  },
});

// In-memory configuration store (in production, use database)
const configStore = new Map<string, RateLimitConfig>();

/**
 * Request logging middleware
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
      },
      'Request completed'
    );
  });
  
  next();
});

/**
 * POST /api/rate-limit/check
 * Check if request is allowed under rate limit
 */
app.post('/api/rate-limit/check', async (req: Request, res: Response) => {
  try {
    const request: RateLimitCheckRequest = req.body;

    // Validate request body
    if (!request.identifier || !request.resource || !request.limit || !request.windowSeconds) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: identifier, resource, limit, windowSeconds',
      });
    }

    // Check rate limit
    const result = await rateLimiter.checkRateLimit(request);

    // Return appropriate status code
    if (result.allowed) {
      return res.status(200).json(result);
    } else {
      return res.status(429).json(result);
    }
  } catch (error) {
    logger.error({ error }, 'Rate limit check failed');
    
    if (error instanceof Error) {
      // Validation errors
      if (error.message.includes('Invalid')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check rate limit',
    });
  }
});

/**
 * GET /api/rate-limit/config/:resource
 * Get configuration for a resource
 */
app.get('/api/rate-limit/config/:resource', (req: Request, res: Response) => {
  try {
    const { resource } = req.params;

    if (!resource || resource.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Resource parameter is required',
      });
    }

    const config = configStore.get(resource);

    if (!config) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Configuration for resource '${resource}' not found`,
      });
    }

    return res.status(200).json(config);
  } catch (error) {
    logger.error({ error }, 'Get config failed');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get configuration',
    });
  }
});

/**
 * PUT /api/rate-limit/config/:resource
 * Update configuration for a resource
 */
app.put('/api/rate-limit/config/:resource', (req: Request, res: Response) => {
  try {
    const { resource } = req.params;
    const update: RateLimitConfigUpdateRequest = req.body;

    if (!resource || resource.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Resource parameter is required',
      });
    }

    if (!update.limit || !update.windowSeconds) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: limit, windowSeconds',
      });
    }

    // Validate limits
    if (!Number.isInteger(update.limit) || update.limit <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid limit: must be positive integer',
      });
    }

    if (!Number.isInteger(update.windowSeconds) || update.windowSeconds <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid windowSeconds: must be positive integer',
      });
    }

    // Update or create configuration
    const config: RateLimitConfig = {
      resource,
      limit: update.limit,
      windowSeconds: update.windowSeconds,
      description: update.description,
    };

    configStore.set(resource, config);

    logger.info({ resource, limit: update.limit, windowSeconds: update.windowSeconds }, 'Config updated');

    return res.status(200).json(config);
  } catch (error) {
    logger.error({ error }, 'Update config failed');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update configuration',
    });
  }
});

/**
 * GET /api/rate-limit/configs
 * List all configurations
 */
app.get('/api/rate-limit/configs', (req: Request, res: Response) => {
  try {
    const configs = Array.from(configStore.values());
    return res.status(200).json({ configs });
  } catch (error) {
    logger.error({ error }, 'List configs failed');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list configurations',
    });
  }
});

/**
 * DELETE /api/rate-limit/config/:resource
 * Delete configuration for a resource
 */
app.delete('/api/rate-limit/config/:resource', (req: Request, res: Response) => {
  try {
    const { resource } = req.params;

    if (!resource || resource.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Resource parameter is required',
      });
    }

    const existed = configStore.delete(resource);

    if (!existed) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Configuration for resource '${resource}' not found`,
      });
    }

    logger.info({ resource }, 'Config deleted');

    return res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Delete config failed');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete configuration',
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const health = rateLimiter.getHealthStatus();
    
    return res.status(200).json({
      status: 'healthy',
      redis: health.redisAvailable ? 'connected' : 'disconnected',
      localCache: {
        size: health.localCacheSize,
        hits: health.localCacheHits,
      },
      fallbackCount: health.redisFallbackCount,
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    return res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

/**
 * Start server
 */
async function start(): Promise<void> {
  try {
    // Initialize rate limiter
    await rateLimiter.initialize();

    // Start Express server
    app.listen(PORT, () => {
      logger.info({ port: PORT, redisUrl: REDIS_URL }, 'Rate limiter server started');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down server');
  
  try {
    await rateLimiter.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start if running directly
if (require.main === module) {
  start();
}

// Export for testing
export { app, rateLimiter, configStore };
