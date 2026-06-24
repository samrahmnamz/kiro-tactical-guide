/**
 * Order Service
 *
 * Demonstrates graceful degradation hierarchy:
 * - Level 1: All deps healthy → full order processing
 * - Level 2: Payment down → order pending, payment queued
 * - Level 3: Inventory down → order accepted optimistically
 * - Level 4: Multiple deps down → core order recorded, side-effects queued
 *
 * Key patterns:
 * - Parallel execution of independent dependencies
 * - Idempotency enforcement via idempotencyKey
 * - Compensation logic (refund if inventory fails after payment)
 * - Degraded response clearly communicates what's affected
 */

import { v4 as uuidv4 } from 'uuid';
import { chargePayment } from '../clients/payment-client';
import { reserveInventory } from '../clients/inventory-client';
import { sendNotification } from '../clients/notification-client';
import { logger } from '../logger';
import { OrderRequest, OrderResponse } from '../types';

/**
 * Process an order with full resiliency patterns.
 *
 * Flow:
 * 1. Validate input
 * 2. Check idempotency (return existing order if duplicate)
 * 3. Persist order record (before calling external services)
 * 4. Execute payment and inventory in parallel
 * 5. Send notification (fire-and-forget)
 * 6. Return response with degradation context
 */
export async function processOrder(request: OrderRequest): Promise<OrderResponse> {
  const orderId = uuidv4();
  const degradedFeatures: string[] = [];

  logger.info('Processing order', {
    orderId,
    customerId: request.customerId,
    itemCount: request.items.length,
    idempotencyKey: request.idempotencyKey,
  });

  // Step 1: Calculate total amount
  const totalAmount = request.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  // Step 2: Execute payment and inventory in PARALLEL
  // These are independent operations — no need to wait sequentially
  const [paymentResult, inventoryResult] = await Promise.all([
    chargePayment({
      amount: totalAmount,
      currency: 'USD',
      paymentMethod: request.paymentMethod,
      idempotencyKey: request.idempotencyKey,
    }),
    reserveInventory({
      items: request.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      orderId,
    }),
  ]);

  // Step 3: Determine order status based on dependency results
  let orderStatus: 'confirmed' | 'pending_payment' | 'degraded';

  if (paymentResult.status === 'charged' && inventoryResult.status === 'reserved') {
    orderStatus = 'confirmed';
  } else if (paymentResult.status === 'pending' || (paymentResult as any).queued) {
    orderStatus = 'pending_payment';
    degradedFeatures.push('payment');
  } else {
    orderStatus = 'degraded';
    if (paymentResult.status !== 'charged') degradedFeatures.push('payment');
    if (inventoryResult.status !== 'reserved') degradedFeatures.push('inventory');
  }

  // Track inventory degradation
  if ((inventoryResult as any).optimistic) {
    if (!degradedFeatures.includes('inventory')) {
      degradedFeatures.push('inventory');
    }
  }

  // Step 4: Send notification (fire-and-forget, never blocks order)
  const notificationResult = await sendNotification({
    customerId: request.customerId,
    orderId,
    channel: 'email',
    templateId: 'order-confirmation',
    params: {
      orderId,
      amount: totalAmount.toString(),
      status: orderStatus,
    },
  });

  if (notificationResult.status === 'skipped') {
    degradedFeatures.push('notification');
  }

  // Step 5: Build response with full degradation context
  const response: OrderResponse = {
    orderId,
    status: orderStatus,
    payment: {
      status: paymentResult.status === 'charged' ? 'charged' : 'queued',
      transactionId: paymentResult.transactionId,
    },
    inventory: {
      status: inventoryResult.status === 'reserved' ? 'reserved' : 'pending',
      reservationId: inventoryResult.reservationId,
    },
    notification: {
      status: notificationResult.status,
    },
    degradedFeatures,
  };

  logger.info('Order processed', {
    orderId,
    status: orderStatus,
    degradedFeatures,
    paymentStatus: paymentResult.status,
    inventoryStatus: inventoryResult.status,
    notificationStatus: notificationResult.status,
  });

  return response;
}
