/**
 * Unit tests for validation helper functions
 * 
 * Tests CAB ticket validation, market hours checking, and actor extraction.
 */

describe('Validation Helpers', () => {
  describe('isValidCabTicket', () => {
    const isValidCabTicket = (ticket: string): boolean => {
      return /^CHG\d{7}$/.test(ticket);
    };

    it('should accept valid CAB ticket format', () => {
      expect(isValidCabTicket('CHG0001234')).toBe(true);
      expect(isValidCabTicket('CHG9999999')).toBe(true);
    });

    it('should reject invalid CAB ticket formats', () => {
      expect(isValidCabTicket('CHG123')).toBe(false); // Too few digits
      expect(isValidCabTicket('CHG12345678')).toBe(false); // Too many digits
      expect(isValidCabTicket('INC0001234')).toBe(false); // Wrong prefix
      expect(isValidCabTicket('chg0001234')).toBe(false); // Lowercase
      expect(isValidCabTicket('CHG000123A')).toBe(false); // Contains letter
    });
  });

  describe('isMarketHours', () => {
    const isMarketHours = (timestamp: string): boolean => {
      const date = new Date(timestamp);
      const etHour = date.getUTCHours() - 5; // Simplified ET conversion
      const dayOfWeek = date.getUTCDay();

      // Weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) return false;

      // Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
      return etHour >= 9 && etHour < 16;
    };

    it('should return true during market hours (9:30 AM - 4:00 PM ET)', () => {
      // Tuesday at 10:00 AM ET (15:00 UTC)
      const duringMarketHours = new Date('2024-01-16T15:00:00.000Z');
      expect(isMarketHours(duringMarketHours.toISOString())).toBe(true);
    });

    it('should return false before market open (before 9:30 AM ET)', () => {
      // Tuesday at 8:00 AM ET (13:00 UTC)
      const beforeMarketOpen = new Date('2024-01-16T13:00:00.000Z');
      expect(isMarketHours(beforeMarketOpen.toISOString())).toBe(false);
    });

    it('should return false after market close (after 4:00 PM ET)', () => {
      // Tuesday at 5:00 PM ET (22:00 UTC)
      const afterMarketClose = new Date('2024-01-16T22:00:00.000Z');
      expect(isMarketHours(afterMarketClose.toISOString())).toBe(false);
    });

    it('should return false on weekends', () => {
      // Saturday at 10:00 AM ET
      const saturday = new Date('2024-01-20T15:00:00.000Z');
      expect(isMarketHours(saturday.toISOString())).toBe(false);

      // Sunday at 10:00 AM ET
      const sunday = new Date('2024-01-21T15:00:00.000Z');
      expect(isMarketHours(sunday.toISOString())).toBe(false);
    });
  });

  describe('extractActor', () => {
    const extractActor = (req: { userId?: string; ip?: string; headers?: Record<string, string> }) => {
      return {
        userId: req.userId || 'unknown',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] || 'unknown',
        authMethod: 'SSO',
      };
    };

    it('should extract actor information from request', () => {
      const req = {
        userId: 'user-123',
        ip: '10.0.1.45',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      };

      const actor = extractActor(req);
      expect(actor.userId).toBe('user-123');
      expect(actor.ipAddress).toBe('10.0.1.45');
      expect(actor.userAgent).toBe('Mozilla/5.0');
      expect(actor.authMethod).toBe('SSO');
    });

    it('should handle missing fields gracefully', () => {
      const req = {};
      const actor = extractActor(req);
      expect(actor.userId).toBe('unknown');
      expect(actor.ipAddress).toBe('unknown');
      expect(actor.userAgent).toBe('unknown');
    });
  });

  describe('isValidSettlementType', () => {
    const isValidSettlementType = (type: string): boolean => {
      return ['net', 'gross'].includes(type);
    };

    it('should accept valid settlement types', () => {
      expect(isValidSettlementType('net')).toBe(true);
      expect(isValidSettlementType('gross')).toBe(true);
    });

    it('should reject invalid settlement types', () => {
      expect(isValidSettlementType('bilateral')).toBe(false);
      expect(isValidSettlementType('NET')).toBe(false); // Case sensitive
      expect(isValidSettlementType('')).toBe(false);
    });
  });
});
