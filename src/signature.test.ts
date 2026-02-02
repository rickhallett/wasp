import { describe, expect, it } from 'bun:test';
import {
  appendSignature,
  checkSignature,
  DEFAULT_SIGNATURE_CONFIG,
  hasSignature,
  type MessageSendEvent,
  validateSignatureConfig,
  validateSignatureConfigAtStartup,
} from './signature.js';

describe('signature enforcement', () => {
  describe('hasSignature', () => {
    it('should detect emoji signature', () => {
      expect(hasSignature('Hello world 🔴', '🔴')).toBe(true);
    });

    it('should detect signature at start', () => {
      expect(hasSignature('🔴 Hello', '🔴')).toBe(true);
    });

    it('should detect signature with HAL prefix', () => {
      expect(hasSignature('Hello\n\n— HAL 🔴', '🔴')).toBe(true);
    });

    it('should return false when signature missing', () => {
      expect(hasSignature('Hello world', '🔴')).toBe(false);
    });

    it('should handle empty content', () => {
      expect(hasSignature('', '🔴')).toBe(false);
    });

    it('should handle custom signatures', () => {
      expect(hasSignature('Message ⬤', '⬤')).toBe(true);
      expect(hasSignature('Message [HAL]', '[HAL]')).toBe(true);
    });
  });

  describe('appendSignature', () => {
    it('should append signature to plain message', () => {
      const result = appendSignature('Hello world', '🔴');
      expect(result).toBe('Hello world\n\n🔴');
    });

    it('should append signature with prefix', () => {
      const result = appendSignature('Hello world', '🔴', '— HAL ');
      expect(result).toBe('Hello world\n\n— HAL 🔴');
    });

    it('should not double-append if signature present', () => {
      const original = 'Hello world 🔴';
      const result = appendSignature(original, '🔴');
      expect(result).toBe(original);
    });

    it('should handle trailing newlines', () => {
      const result = appendSignature('Hello world\n\n', '🔴', '— HAL ');
      expect(result).toBe('Hello world\n\n— HAL 🔴');
    });

    it('should handle multi-line messages', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = appendSignature(content, '🔴');
      expect(result).toBe('Line 1\nLine 2\nLine 3\n\n🔴');
    });

    it('should handle empty content', () => {
      const result = appendSignature('', '🔴');
      expect(result).toBe('\n\n🔴');
    });
  });

  describe('checkSignature', () => {
    const baseEvent: MessageSendEvent = {
      content: 'Hello from HAL',
      channel: 'whatsapp',
      fromAgent: true,
    };

    // Config with enforcement enabled (required for most tests)
    const enabledConfig = { enabled: true, signature: '🔴' };

    it('should pass when signature already present', () => {
      const event = { ...baseEvent, content: 'Hello from HAL 🔴' };
      const result = checkSignature(event, enabledConfig);

      expect(result.block).toBe(false);
      expect(result.signaturePresent).toBe(true);
      expect(result.signatureAppended).toBe(false);
      expect(result.modifiedContent).toBeUndefined();
    });

    it('should auto-append signature when missing (default action)', () => {
      const result = checkSignature(baseEvent, enabledConfig);

      expect(result.block).toBe(false);
      expect(result.signaturePresent).toBe(false);
      expect(result.signatureAppended).toBe(true);
      expect(result.modifiedContent).toBe('Hello from HAL\n\n🔴');
    });

    it('should auto-append with prefix when configured', () => {
      const result = checkSignature(baseEvent, {
        ...enabledConfig,
        signaturePrefix: '— HAL ',
      });

      expect(result.signatureAppended).toBe(true);
      expect(result.modifiedContent).toBe('Hello from HAL\n\n— HAL 🔴');
    });

    it('should block when action=block and signature missing', () => {
      const result = checkSignature(baseEvent, { ...enabledConfig, action: 'block' });

      expect(result.block).toBe(true);
      expect(result.blockReason).toContain('missing signature');
      expect(result.signaturePresent).toBe(false);
      expect(result.signatureAppended).toBe(false);
    });

    it('should skip non-whatsapp channels by default', () => {
      const event = { ...baseEvent, channel: 'discord' };
      const result = checkSignature(event, enabledConfig);

      expect(result.block).toBe(false);
      expect(result.signatureAppended).toBe(false);
    });

    it('should enforce on custom channel list', () => {
      const event = { ...baseEvent, channel: 'telegram' };
      const result = checkSignature(event, {
        ...enabledConfig,
        channels: ['telegram', 'whatsapp'],
      });

      expect(result.signatureAppended).toBe(true);
    });

    it('should skip when fromAgent is false (user content)', () => {
      const event = { ...baseEvent, fromAgent: false };
      const result = checkSignature(event, enabledConfig);

      expect(result.block).toBe(false);
      expect(result.signatureAppended).toBe(false);
    });

    it('should skip when disabled', () => {
      const result = checkSignature(baseEvent, { enabled: false });

      expect(result.block).toBe(false);
      expect(result.signatureAppended).toBe(false);
    });

    it('should use custom signature', () => {
      const event = { ...baseEvent, content: 'Hello ⬤' };
      const result = checkSignature(event, { enabled: true, signature: '⬤' });

      expect(result.signaturePresent).toBe(true);
      expect(result.signatureAppended).toBe(false);
    });

    it('should handle empty content', () => {
      const event = { ...baseEvent, content: '' };
      const result = checkSignature(event, enabledConfig);

      expect(result.block).toBe(false);
      expect(result.signatureAppended).toBe(true);
    });

    it('should treat undefined fromAgent as agent message', () => {
      const event: MessageSendEvent = {
        content: 'Hello',
        channel: 'whatsapp',
        // fromAgent not specified
      };
      const result = checkSignature(event, enabledConfig);

      // Should enforce (append by default)
      expect(result.signatureAppended).toBe(true);
    });

    it('should skip when disabled by default (no config)', () => {
      const result = checkSignature(baseEvent);

      // Default is disabled
      expect(result.block).toBe(false);
      expect(result.signatureAppended).toBe(false);
    });
  });

  describe('validateSignatureConfigAtStartup', () => {
    it('should pass with undefined config', () => {
      expect(() => validateSignatureConfigAtStartup(undefined)).not.toThrow();
    });

    it('should pass when disabled', () => {
      expect(() => validateSignatureConfigAtStartup({ enabled: false })).not.toThrow();
    });

    it('should pass when enabled with signature', () => {
      expect(() =>
        validateSignatureConfigAtStartup({
          enabled: true,
          signature: '🔴',
        })
      ).not.toThrow();
    });

    it('should throw when enabled without signature', () => {
      expect(() =>
        validateSignatureConfigAtStartup({
          enabled: true,
        })
      ).toThrow('signature is required');
    });

    it('should throw when enabled with empty signature', () => {
      expect(() =>
        validateSignatureConfigAtStartup({
          enabled: true,
          signature: '',
        })
      ).toThrow('signature is required');
    });
  });

  describe('validateSignatureConfig', () => {
    it('should accept undefined', () => {
      expect(validateSignatureConfig(undefined)).toBe(true);
    });

    it('should accept null', () => {
      expect(validateSignatureConfig(null)).toBe(true);
    });

    it('should accept empty object', () => {
      expect(validateSignatureConfig({})).toBe(true);
    });

    it('should accept valid full config', () => {
      const config = {
        enabled: true,
        signature: '🔴',
        action: 'append',
        channels: ['whatsapp'],
      };
      expect(validateSignatureConfig(config)).toBe(true);
    });

    it('should accept partial config', () => {
      expect(validateSignatureConfig({ enabled: false })).toBe(true);
      expect(validateSignatureConfig({ action: 'block' })).toBe(true);
      expect(validateSignatureConfig({ channels: ['telegram'] })).toBe(true);
    });

    it('should reject invalid enabled type', () => {
      expect(validateSignatureConfig({ enabled: 'true' })).toBe(false);
    });

    it('should reject invalid action value', () => {
      expect(validateSignatureConfig({ action: 'warn' })).toBe(false);
    });

    it('should reject non-array channels', () => {
      expect(validateSignatureConfig({ channels: 'whatsapp' })).toBe(false);
    });

    it('should reject channels with non-string elements', () => {
      expect(validateSignatureConfig({ channels: [123] })).toBe(false);
    });

    it('should reject non-object config', () => {
      expect(validateSignatureConfig('string')).toBe(false);
      expect(validateSignatureConfig(123)).toBe(false);
    });
  });

  describe('DEFAULT_SIGNATURE_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_SIGNATURE_CONFIG.enabled).toBe(false); // Opt-in
      expect(DEFAULT_SIGNATURE_CONFIG.signature).toBeUndefined(); // Must be configured
      expect(DEFAULT_SIGNATURE_CONFIG.action).toBe('append');
      expect(DEFAULT_SIGNATURE_CONFIG.channels).toContain('whatsapp');
    });
  });
});
