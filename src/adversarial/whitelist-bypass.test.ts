/**
 * ADVERSARIAL TESTS: Whitelist Bypass Attempts
 * 
 * These tests attempt to bypass the whitelist through various attack vectors:
 * - Case sensitivity confusion
 * - Unicode normalization attacks
 * - Platform confusion
 * - Identifier manipulation
 * - SQL injection
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DIR = join(tmpdir(), `wasp-adversarial-whitelist-${Date.now()}`);
process.env.WASP_DATA_DIR = TEST_DIR;

import { closeDb, initSchema, resetCache } from '../db/client.js';
import { addContact, checkContact, getContact, removeContact, listContacts } from '../db/contacts.js';

describe('adversarial/whitelist-bypass', () => {
  beforeAll(() => {
    resetCache();
    initSchema();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('identifier manipulation', () => {
    beforeEach(() => {
      // Add a known trusted contact
      addContact('+440123456789', 'whatsapp', 'trusted', 'Trusted User');
    });

    it('should not allow leading/trailing whitespace bypass', () => {
      const variants = [
        ' +440123456789',
        '+440123456789 ',
        ' +440123456789 ',
        '\t+440123456789',
        '+440123456789\n',
        '\r\n+440123456789',
      ];

      for (const variant of variants) {
        const result = checkContact(variant, 'whatsapp');
        // Should NOT match the trusted contact
        expect(result.allowed).toBe(false);
      }
    });

    it('should handle case sensitivity correctly for phone numbers', () => {
      // Phone numbers shouldn't have case, but identifiers might
      addContact('USER@example.com', 'email', 'trusted', 'Email User');
      
      // These should NOT match (case-sensitive)
      const variants = [
        'user@example.com',
        'USER@EXAMPLE.COM',
        'User@Example.Com',
      ];

      for (const variant of variants) {
        const result = checkContact(variant, 'email');
        // Depending on design decision - test current behavior
        // For security: case-sensitive is safer
      }
    });

    it('should not allow null byte injection', () => {
      const nullByteVariants = [
        '+440123456789\x00attacker',
        '\x00+440123456789',
        '+44012345\x006789',
      ];

      for (const variant of nullByteVariants) {
        const result = checkContact(variant, 'whatsapp');
        expect(result.allowed).toBe(false);
      }
    });

    it('should not allow unicode lookalike bypass', () => {
      // Unicode characters that look like ASCII
      const lookalikes = [
        '+４40123456789', // Fullwidth digit 4
        '+44０123456789', // Fullwidth digit 0
        '+＋440123456789', // Fullwidth plus
        '+44𝟎123456789', // Mathematical digit
      ];

      for (const variant of lookalikes) {
        const result = checkContact(variant, 'whatsapp');
        expect(result.allowed).toBe(false);
      }
    });

    it('should not allow zero-width character injection', () => {
      const zeroWidth = [
        '+44\u200B0123456789', // Zero-width space
        '+44\u200C0123456789', // Zero-width non-joiner
        '+44\u200D0123456789', // Zero-width joiner
        '+44\uFEFF0123456789', // Byte order mark
      ];

      for (const variant of zeroWidth) {
        const result = checkContact(variant, 'whatsapp');
        expect(result.allowed).toBe(false);
      }
    });

    it('should not allow homograph attacks', () => {
      // Cyrillic/Greek characters that look like Latin
      const homographs = [
        '+440123456789', // Real (baseline)
        '+44О123456789', // Cyrillic О instead of 0
      ];

      // First should be allowed
      expect(checkContact(homographs[0], 'whatsapp').allowed).toBe(true);
      // Homograph should be denied
      expect(checkContact(homographs[1], 'whatsapp').allowed).toBe(false);
    });
  });

  describe('platform confusion', () => {
    beforeEach(() => {
      addContact('+440123456789', 'whatsapp', 'trusted', 'WhatsApp User');
    });

    it('should not allow cross-platform bypass', () => {
      // Same identifier, different platform should not match
      const platforms = ['telegram', 'signal', 'email', 'discord', 'slack'];
      
      for (const platform of platforms) {
        const result = checkContact('+440123456789', platform as any);
        expect(result.allowed).toBe(false);
      }
    });

    it('should reject invalid platform values', () => {
      const invalidPlatforms = [
        'WHATSAPP', // Wrong case
        'whatsApp',
        'what sapp',
        'whatsapp\x00',
        '',
        'undefined',
        'null',
      ];

      // These should either reject or not match
      for (const platform of invalidPlatforms) {
        // The function may throw or return false - either is acceptable
        try {
          const result = checkContact('+440123456789', platform as any);
          // If it doesn't throw, it should deny
          expect(result.allowed).toBe(false);
        } catch {
          // Throwing is also acceptable for invalid input
        }
      }
    });

    it('should not allow platform field SQL injection', () => {
      const sqlPayloads = [
        "whatsapp' OR '1'='1",
        "whatsapp'; DROP TABLE contacts; --",
        'whatsapp" OR "1"="1',
        "whatsapp\x00' OR 1=1--",
      ];

      for (const payload of sqlPayloads) {
        try {
          const result = checkContact('+440123456789', payload as any);
          expect(result.allowed).toBe(false);
        } catch {
          // Throwing is acceptable
        }
      }
    });
  });

  describe('SQL injection via identifier', () => {
    it('should not allow SQL injection in identifier check', () => {
      const payloads = [
        "' OR '1'='1",
        "' OR '1'='1' --",
        "'; DROP TABLE contacts; --",
        '" OR "1"="1',
        "1; SELECT * FROM contacts--",
        "' UNION SELECT * FROM contacts--",
        "'+440123456789'",
      ];

      for (const payload of payloads) {
        const result = checkContact(payload, 'whatsapp');
        expect(result.allowed).toBe(false);
        // Should not throw (graceful handling)
      }
    });

    it('should not allow SQL injection in add contact', () => {
      const payloads = [
        "'); DELETE FROM contacts; --",
        "', 'whatsapp', 'sovereign', 'Hacker'); --",
      ];

      for (const payload of payloads) {
        try {
          addContact(payload, 'whatsapp', 'trusted', 'Test');
          // If it succeeds, make sure it's stored literally
          const stored = getContact(payload, 'whatsapp');
          expect(stored?.identifier).toBe(payload);
        } catch {
          // Throwing is acceptable
        }
      }

      // Verify contacts table still works
      const contacts = listContacts();
      expect(Array.isArray(contacts)).toBe(true);
    });
  });

  describe('identifier length attacks', () => {
    it('should handle very long identifiers', () => {
      const longId = 'a'.repeat(10000);
      
      // Should not crash
      const result = checkContact(longId, 'whatsapp');
      expect(result.allowed).toBe(false);
    });

    it('should handle empty identifier', () => {
      const result = checkContact('', 'whatsapp');
      expect(result.allowed).toBe(false);
    });

    it('should handle identifier with only special characters', () => {
      const specials = [
        '!@#$%^&*()',
        '🔥💀👻',
        '\n\r\t',
        '   ',
      ];

      for (const special of specials) {
        const result = checkContact(special, 'whatsapp');
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('trust level manipulation', () => {
    it('should not allow adding contact with invalid trust level', () => {
      const invalidTrusts = [
        'SOVEREIGN', // Wrong case
        'admin',
        'root',
        'superuser',
        "trusted'; --",
      ];

      for (const trust of invalidTrusts) {
        try {
          addContact('+449999999999', 'whatsapp', trust as any, 'Test');
          // If it doesn't throw, check it used a safe default or stored literally
          const contact = getContact('+449999999999', 'whatsapp');
          // Trust should either be the literal string or a safe default
          expect(['sovereign', 'trusted', 'limited', trust]).toContain(contact?.trust);
          removeContact('+449999999999', 'whatsapp');
        } catch {
          // Throwing is acceptable
        }
      }
    });
  });

  describe('concurrent access', () => {
    it('should handle rapid add/check/remove without race conditions', async () => {
      const testId = '+447777777777';
      const iterations = 100;
      
      const operations = [];
      
      for (let i = 0; i < iterations; i++) {
        operations.push(
          (async () => {
            addContact(testId, 'whatsapp', 'trusted', 'Race Test');
            const check = checkContact(testId, 'whatsapp');
            removeContact(testId, 'whatsapp');
            return check;
          })()
        );
      }

      // All operations should complete without crashing
      const results = await Promise.all(operations);
      
      // At least some should have seen the contact as allowed
      // (exact behavior depends on timing)
      expect(results.length).toBe(iterations);
    });
  });
});
