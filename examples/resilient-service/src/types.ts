// Order Service Types

export interface OrderRequest {
  customerId: string;
  items: OrderItem[];
  paymentMethod: 'card' | 'bank_transfer';
  shippingAddress: ShippingAddress;
  idempotencyKey: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface ShippingAddress {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderResponse {
  orderId: string;
  status: 'confirmed' | 'pending_payment' | 'degraded';
  payment: {
    status: 'charged' | 'pending' | 'queued';
    transactionId: string | null;
  };
  inventory: {
    status: 'reserved' | 'pending' | 'unavailable';
    reservationId: string | null;
  };
  notification: {
    status: 'sent' | 'queued' | 'skipped';
  };
  degradedFeatures: string[];
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfter: number | null;
  };
}

// Circuit Breaker Types

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  volumeThreshold: number;
  name: string;
}

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs: number | null;
  circuitState: CircuitState;
  lastFailure: string | null;
  failureCount: number;
}

// Retry Types

export type JitterStrategy = 'full' | 'equal' | 'decorrelated';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: JitterStrategy;
  retryIf: (error: any) => boolean;
  onRetry?: (error: any, attempt: number, delayMs: number) => void;
}
