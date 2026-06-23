/**
 * Type definitions for Payment Processor service
 */

export interface PaymentRequest {
  stripeToken: string;
  amount: number;
  currency: string;
  orderId: string;
  metadata: {
    customerEmail: string;
    orderDescription: string;
  };
}

export interface PaymentResponse {
  paymentId: string;
  stripeChargeId: string;
  status: 'succeeded' | 'pending' | 'failed';
  amount: number;
  currency: string;
  receiptUrl: string;
  createdAt: string;
}

export interface PaymentRecord {
  paymentId: string;
  orderId: string;
  stripeChargeId: string;
  amount: number;
  currency: string;
  status: string;
  cardLastFour: string; // Encrypted
  customerEmail: string; // Encrypted
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  ttl: number; // Unix timestamp for auto-deletion after 7 years
}

export interface PaymentRetrievalResponse {
  paymentId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  lastFourDigits: string; // Decrypted for response
  createdAt: string;
  updatedAt: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
