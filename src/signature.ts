/**
 * Signature Enforcement for wasp
 *
 * Ensures outbound messages from agents include an identity signature
 * so recipients can distinguish AI-generated messages from human ones.
 */

import { logDebug, logInfo, logWarn } from './logger.js';

export interface SignatureConfig {
  enabled: boolean;
  signature?: string; // Required if enabled
  signaturePrefix?: string; // e.g., "— HAL " (optional, prepended to signature)
  action: 'block' | 'append';
  channels: string[];
}

export const DEFAULT_SIGNATURE_CONFIG: Partial<SignatureConfig> = {
  enabled: false, // Opt-in, not default
  action: 'append',
  channels: ['whatsapp'],
};

/**
 * Validate signature config at startup.
 * Throws if enabled but signature is missing or empty.
 */
export function validateSignatureConfigAtStartup(config: Partial<SignatureConfig> = {}): void {
  const merged = { ...DEFAULT_SIGNATURE_CONFIG, ...config };

  if (merged.enabled && (!merged.signature || merged.signature.trim() === '')) {
    throw new Error(
      'wasp: signatureEnforcement.signature is required when enforcement is enabled. ' +
        'Set a signature (e.g., "🔴") or disable enforcement.'
    );
  }
}

export interface MessageSendEvent {
  content: string;
  channel: string;
  /** True if this is a message from the agent, false if forwarding user content */
  fromAgent?: boolean;
  /** Target recipient (phone/id) */
  target?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface SignatureCheckResult {
  /** Whether to block the send */
  block: boolean;
  /** Reason for blocking (if block=true) */
  blockReason?: string;
  /** Modified content (if action=append and signature was missing) */
  modifiedContent?: string;
  /** Whether signature was already present */
  signaturePresent: boolean;
  /** Whether signature was appended */
  signatureAppended: boolean;
}

/**
 * Check if message content contains the signature.
 * Uses simple string inclusion - the signature is typically an emoji.
 */
export function hasSignature(content: string, signature: string): boolean {
  return content.includes(signature);
}

/**
 * Append signature to message content.
 * Adds signature at the end with proper spacing.
 */
export function appendSignature(content: string, signature: string, prefix?: string): string {
  // Avoid double-append
  if (hasSignature(content, signature)) {
    return content;
  }

  // Build the full signature with optional prefix
  const fullSignature = prefix ? `${prefix}${signature}` : signature;

  // Append with appropriate spacing
  const trimmed = content.trimEnd();

  // If content ends with newlines, preserve them and add signature
  if (trimmed !== content) {
    return `${trimmed}\n\n${fullSignature}`;
  }

  // Single-line or paragraph: add with newlines
  return `${content}\n\n${fullSignature}`;
}

/**
 * Check and potentially modify an outbound message for signature compliance.
 */
export function checkSignature(
  event: MessageSendEvent,
  config: Partial<SignatureConfig> = {}
): SignatureCheckResult {
  const mergedConfig = {
    ...DEFAULT_SIGNATURE_CONFIG,
    ...config,
  };

  // If disabled, always pass through
  if (!mergedConfig.enabled) {
    return {
      block: false,
      signaturePresent: false,
      signatureAppended: false,
    };
  }

  // Check if channel is in scope
  const channels = mergedConfig.channels || ['whatsapp'];
  if (!channels.includes(event.channel)) {
    logDebug('signature', `Channel ${event.channel} not in enforcement list, skipping`);
    return {
      block: false,
      signaturePresent: false,
      signatureAppended: false,
    };
  }

  // Only enforce on agent messages, not forwarded user content
  if (event.fromAgent === false) {
    logDebug('signature', 'Message not from agent, skipping enforcement');
    return {
      block: false,
      signaturePresent: false,
      signatureAppended: false,
    };
  }

  const content = event.content || '';
  const signature = mergedConfig.signature;

  // This shouldn't happen if validateSignatureConfigAtStartup was called, but guard anyway
  if (!signature) {
    logWarn('signature', 'Signature enforcement enabled but no signature configured');
    return {
      block: false,
      signaturePresent: false,
      signatureAppended: false,
    };
  }

  // Check if signature already present
  if (hasSignature(content, signature)) {
    logDebug('signature', 'Signature already present');
    return {
      block: false,
      signaturePresent: true,
      signatureAppended: false,
    };
  }

  // Signature missing - take action based on config
  logWarn('signature', `Signature missing from outbound ${event.channel} message`);

  if (mergedConfig.action === 'block') {
    logWarn('signature', 'Blocking message send (action=block)');
    return {
      block: true,
      blockReason: `wasp: message blocked - missing signature (${signature}). Add the configured signature to your message.`,
      signaturePresent: false,
      signatureAppended: false,
    };
  }

  // action === 'append'
  const modifiedContent = appendSignature(content, signature, mergedConfig.signaturePrefix);
  logInfo('signature', 'Auto-appended signature to message');

  return {
    block: false,
    modifiedContent,
    signaturePresent: false,
    signatureAppended: true,
  };
}

/**
 * Validate signature config shape.
 */
export function validateSignatureConfig(config: unknown): config is Partial<SignatureConfig> {
  if (config === null || config === undefined) {
    return true; // Will use defaults
  }

  if (typeof config !== 'object') {
    return false;
  }

  const c = config as Record<string, unknown>;

  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') {
    return false;
  }

  if (c.signature !== undefined && typeof c.signature !== 'string') {
    return false;
  }

  if (c.action !== undefined && c.action !== 'block' && c.action !== 'append') {
    return false;
  }

  if (c.channels !== undefined) {
    if (!Array.isArray(c.channels)) {
      return false;
    }
    if (!c.channels.every((ch) => typeof ch === 'string')) {
      return false;
    }
  }

  return true;
}
