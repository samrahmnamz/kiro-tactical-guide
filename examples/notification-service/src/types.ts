/**
 * Type Definitions for Notification Service
 * 
 * TypeScript type definitions derived from API contracts in spec.md.
 * These types ensure type safety across the entire notification service.
 * 
 * ## Type Categories
 * - **Channel Types**: Notification delivery channels (email, SMS, push)
 * - **API Types**: Request/response schemas for REST endpoints
 * - **Database Types**: DynamoDB table schemas
 * - **Queue Types**: SQS message formats
 * - **Event Types**: EventBridge event schemas
 * 
 * @module types
 */

/**
 * Supported notification delivery channels.
 * 
 * - `email`: Delivered via AWS SES
 * - `sms`: Delivered via AWS SNS (SMS)
 * - `push`: Delivered via AWS SNS (mobile push notifications)
 */
export type NotificationChannel = 'email' | 'sms' | 'push';

/**
 * Notification priority levels for queue routing.
 * 
 * Priority determines which SQS queue the notification is sent to and
 * the expected delivery time:
 * - `high`: ~30 seconds delivery time
 * - `normal`: ~5 minutes delivery time
 * - `low`: ~1 hour delivery time
 */
export type NotificationPriority = 'high' | 'normal' | 'low';

/**
 * Notification lifecycle status values.
 * 
 * - `queued`: Notification is waiting in SQS queue
 * - `sent`: Successfully sent to delivery service (SES/SNS)
 * - `delivered`: Delivery confirmed (future webhook integration)
 * - `failed`: Delivery failed after max retries
 * - `suppressed`: Customer opted out of this channel
 */
export type NotificationStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'suppressed';

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for POST /api/notifications/send endpoint.
 * 
 * Sends a notification to a customer via the specified channel using a template.
 * 
 * @example
 * ```json
 * {
 *   "customerId": "user-12345",
 *   "channel": "email",
 *   "templateId": "order-confirmation",
 *   "params": {
 *     "orderId": "ORDER-789",
 *     "amount": 99.99,
 *     "estimatedDelivery": "2024-01-20"
 *   },
 *   "priority": "normal"
 * }
 * ```
 */
export interface SendNotificationRequest {
  /** Unique identifier for the customer receiving the notification */
  customerId: string;
  
  /** Delivery channel (email, sms, or push) */
  channel: NotificationChannel;
  
  /** Template identifier (e.g., "order-confirmation", "password-reset") */
  templateId: string;
  
  /** Template parameters for rendering (supports strings, numbers, and booleans) */
  params: Record<string, string | number | boolean>;
  
  /** Optional priority level (defaults to "normal" if not specified) */
  priority?: NotificationPriority;
}

/**
 * Response body for POST /api/notifications/send endpoint.
 * 
 * Returns 202 Accepted with notification details and estimated delivery time.
 * 
 * @example
 * ```json
 * {
 *   "notificationId": "550e8400-e29b-41d4-a716-446655440000",
 *   "status": "queued",
 *   "estimatedDelivery": "2024-01-15T10:35:00.000Z",
 *   "channel": "email"
 * }
 * ```
 */
export interface SendNotificationResponse {
  /** UUID of the created notification (for status tracking) */
  notificationId: string;
  
  /** Current status (typically "queued" for new notifications) */
  status: NotificationStatus;
  
  /** ISO timestamp of estimated delivery time */
  estimatedDelivery: string;
  
  /** Delivery channel used */
  channel: string;
}

/**
 * Response body for GET /api/notifications/:notificationId/status endpoint.
 * 
 * Returns complete notification status including delivery timestamps and error details.
 * 
 * @example
 * ```json
 * {
 *   "notificationId": "550e8400-e29b-41d4-a716-446655440000",
 *   "customerId": "user-12345",
 *   "channel": "email",
 *   "templateId": "order-confirmation",
 *   "status": "sent",
 *   "timestamps": {
 *     "queued": "2024-01-15T10:00:00.000Z",
 *     "sent": "2024-01-15T10:05:23.000Z",
 *     "delivered": null,
 *     "failed": null
 *   },
 *   "attempts": 1,
 *   "errorMessage": null
 * }
 * ```
 */
export interface NotificationStatusResponse {
  /** UUID of the notification */
  notificationId: string;
  
  /** Customer who received the notification */
  customerId: string;
  
  /** Delivery channel used */
  channel: string;
  
  /** Template identifier */
  templateId: string;
  
  /** Current lifecycle status */
  status: NotificationStatus;
  
  /** Timestamps for each status transition (null if not yet reached) */
  timestamps: {
    queued: string;
    sent: string | null;
    delivered: string | null;
    failed: string | null;
  };
  
  /** Number of send attempts made */
  attempts: number;
  
  /** Error message if status is "failed", null otherwise */
  errorMessage: string | null;
}

/**
 * Standard error response format.
 * 
 * Used for all error responses (4xx and 5xx status codes).
 * 
 * @example
 * ```json
 * {
 *   "error": {
 *     "code": "invalid_channel",
 *     "message": "Invalid channel: text. Must be email, sms, or push"
 *   }
 * }
 * ```
 */
export interface ErrorResponse {
  error: {
    /** Machine-readable error code (snake_case) */
    code: string;
    
    /** Human-readable error message */
    message: string;
  };
}

// ============================================================================
// DynamoDB Table Schemas
// ============================================================================

/**
 * NotificationRecords table schema.
 * 
 * Stores the complete lifecycle of each notification including status,
 * timestamps, retry attempts, and error information.
 * 
 * ## Table Configuration
 * - Primary key: `notificationId` (UUID)
 * - GSI: `IdempotencyKeyIndex` on `idempotencyKey` (for duplicate detection)
 * - TTL: Enabled on `ttl` attribute (90-day retention)
 * 
 * @example
 * ```typescript
 * const record: NotificationRecord = {
 *   notificationId: "550e8400-e29b-41d4-a716-446655440000",
 *   customerId: "user-12345",
 *   channel: "email",
 *   templateId: "order-confirmation",
 *   params: { orderId: "ORDER-789", amount: 99.99 },
 *   status: "queued",
 *   attempts: 0,
 *   timestamps: {
 *     queued: "2024-01-15T10:00:00.000Z",
 *     sent: null,
 *     delivered: null,
 *     failed: null
 *   },
 *   errorMessage: null,
 *   createdAt: "2024-01-15T10:00:00.000Z",
 *   updatedAt: "2024-01-15T10:00:00.000Z",
 *   ttl: 1713873600,
 *   idempotencyKey: "user-12345:order-confirmation:498765",
 *   priority: "normal"
 * };
 * ```
 */
export interface NotificationRecord {
  /** UUID primary key */
  notificationId: string;
  
  /** Customer receiving the notification */
  customerId: string;
  
  /** Delivery channel */
  channel: NotificationChannel;
  
  /** Template identifier */
  templateId: string;
  
  /** Template rendering parameters */
  params: Record<string, string | number | boolean>;
  
  /** Current lifecycle status */
  status: NotificationStatus;
  
  /** Number of delivery attempts made */
  attempts: number;
  
  /** Timestamps for each status transition */
  timestamps: {
    queued: string;
    sent: string | null;
    delivered: string | null;
    failed: string | null;
  };
  
  /** Error message if delivery failed */
  errorMessage: string | null;
  
  /** ISO timestamp when record was created */
  createdAt: string;
  
  /** ISO timestamp when record was last updated */
  updatedAt: string;
  
  /** Unix epoch seconds for TTL (DynamoDB automatically deletes after this time) */
  ttl: number;
  
  /** Optional idempotency key for duplicate detection (format: "customerId:templateId:hourBucket") */
  idempotencyKey?: string;
  
  /** Priority level for queue routing */
  priority: NotificationPriority;
}

/**
 * CustomerPreferences table schema.
 * 
 * Stores customer opt-out preferences and preferred notification channels.
 * Used to enforce customer consent before sending notifications.
 * 
 * ## Table Configuration
 * - Primary key: `customerId`
 * - No GSIs or TTL
 * 
 * @example
 * ```typescript
 * const preferences: CustomerPreferences = {
 *   customerId: "user-12345",
 *   emailOptOut: false,
 *   smsOptOut: true,  // Customer opted out of SMS
 *   pushOptOut: false,
 *   preferredChannels: ["email", "push"],
 *   updatedAt: "2024-01-15T10:00:00.000Z"
 * };
 * ```
 */
export interface CustomerPreferences {
  /** Customer identifier (primary key) */
  customerId: string;
  
  /** True if customer opted out of email notifications */
  emailOptOut: boolean;
  
  /** True if customer opted out of SMS notifications */
  smsOptOut: boolean;
  
  /** True if customer opted out of push notifications */
  pushOptOut: boolean;
  
  /** Ordered list of preferred channels (highest to lowest preference) */
  preferredChannels: NotificationChannel[];
  
  /** ISO timestamp when preferences were last updated */
  updatedAt: string;
}

// ============================================================================
// EventBridge Event Types
// ============================================================================

/**
 * Account event types that can trigger notifications.
 * 
 * These events are published to EventBridge by other services and
 * consumed by the notification service to send relevant notifications.
 */
export type AccountEventType =
  | 'account.created'      // New user account created
  | 'account.verified'     // Email/phone verification completed
  | 'password.reset'       // Password reset requested
  | 'payment.failed';      // Payment processing failed

/**
 * EventBridge event schema for account-related events.
 * 
 * Standard EventBridge event envelope with account-specific detail payload.
 * 
 * @example
 * ```typescript
 * const event: AccountEvent = {
 *   source: "myapp.accounts",
 *   "detail-type": "Account Event",
 *   detail: {
 *     eventType: "account.created",
 *     customerId: "user-12345",
 *     timestamp: "2024-01-15T10:00:00.000Z",
 *     metadata: {
 *       email: "user@example.com",
 *       signupSource: "web"
 *     }
 *   }
 * };
 * ```
 */
export interface AccountEvent {
  /** Event source identifier (e.g., "myapp.accounts") */
  source: string;
  
  /** Human-readable event category */
  'detail-type': string;
  
  /** Event payload with account information */
  detail: {
    /** Specific account event type */
    eventType: AccountEventType;
    
    /** Customer the event relates to */
    customerId: string;
    
    /** ISO timestamp when the event occurred */
    timestamp: string;
    
    /** Additional event-specific data */
    metadata: Record<string, unknown>;
  };
}

// ============================================================================
// Internal Processing Types
// ============================================================================

/**
 * SQS queue message format.
 * 
 * Messages are enqueued by the API and processed by workers.
 * The message contains all information needed to send the notification.
 * 
 * @example
 * ```typescript
 * const message: QueueMessage = {
 *   notificationId: "550e8400-e29b-41d4-a716-446655440000",
 *   customerId: "user-12345",
 *   channel: "email",
 *   templateId: "order-confirmation",
 *   params: { orderId: "ORDER-789", amount: 99.99 },
 *   priority: "normal"
 * };
 * ```
 */
export interface QueueMessage {
  /** UUID linking to NotificationRecord in DynamoDB */
  notificationId: string;
  
  /** Customer receiving the notification */
  customerId: string;
  
  /** Delivery channel */
  channel: NotificationChannel;
  
  /** Template to render */
  templateId: string;
  
  /** Template parameters */
  params: Record<string, string | number | boolean>;
  
  /** Priority level (determines which queue this was sent to) */
  priority: NotificationPriority;
}

/**
 * Notification template definition.
 * 
 * Templates define the structure and required parameters for each notification type.
 * In production, these would be stored in a database or configuration service.
 * 
 * @example
 * ```typescript
 * const template: NotificationTemplate = {
 *   templateId: "order-confirmation",
 *   channel: "email",
 *   subject: "Your order {{orderId}} has been confirmed",
 *   body: "Thank you for your order! Order {{orderId}} for ${{amount}} will be delivered by {{estimatedDelivery}}.",
 *   requiredParams: ["orderId", "amount", "estimatedDelivery"]
 * };
 * ```
 */
export interface NotificationTemplate {
  /** Unique template identifier */
  templateId: string;
  
  /** Channel this template is designed for */
  channel: NotificationChannel;
  
  /** Email subject line (email channel only) */
  subject?: string;
  
  /** Template body with {{param}} placeholders */
  body: string;
  
  /** List of parameter names that must be provided */
  requiredParams: string[];
}
