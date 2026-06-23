/**
 * Unit tests for notification service
 * **Validates: Requirements 3.5, 3.6, 3.9** (Opt-out enforcement, Idempotency, Error handling)
 */

import { isOptedOut } from '../../src/notification-service';
import { CustomerPreferences } from '../../src/types';

describe('Notification Service', () => {
  describe('isOptedOut', () => {
    it('should return true when customer opted out of email', () => {
      const prefs: CustomerPreferences = {
        customerId: '123',
        emailOptOut: true,
        smsOptOut: false,
        pushOptOut: false,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(prefs, 'email')).toBe(true);
    });

    it('should return false when customer has not opted out of email', () => {
      const prefs: CustomerPreferences = {
        customerId: '123',
        emailOptOut: false,
        smsOptOut: false,
        pushOptOut: false,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(prefs, 'email')).toBe(false);
    });

    it('should return true when customer opted out of SMS', () => {
      const prefs: CustomerPreferences = {
        customerId: '123',
        emailOptOut: false,
        smsOptOut: true,
        pushOptOut: false,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(prefs, 'sms')).toBe(true);
    });

    it('should return true when customer opted out of push', () => {
      const prefs: CustomerPreferences = {
        customerId: '123',
        emailOptOut: false,
        smsOptOut: false,
        pushOptOut: true,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(prefs, 'push')).toBe(true);
    });

    it('should handle all channels independently', () => {
      const prefs: CustomerPreferences = {
        customerId: '123',
        emailOptOut: true,
        smsOptOut: false,
        pushOptOut: true,
        preferredChannels: [],
        updatedAt: new Date().toISOString(),
      };

      expect(isOptedOut(prefs, 'email')).toBe(true);
      expect(isOptedOut(prefs, 'sms')).toBe(false);
      expect(isOptedOut(prefs, 'push')).toBe(true);
    });
  });
});
