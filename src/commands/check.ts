import { output } from '../cli/output.js';
import type { ContactCheckResult, OutputOptions } from '../cli/types.js';
import { logDecision } from '../db/audit.js';
import { checkContact } from '../db/contacts.js';
import type { Platform } from '../types.js';

export interface CheckOptions extends OutputOptions {
  platform?: Platform;
}

/**
 * Check a contact and return result data (testable, no side effects on output)
 * Note: This still logs the decision to the audit log as a side effect
 */
export function doCheckContact(
  identifier: string,
  options: Omit<CheckOptions, keyof OutputOptions>
): ContactCheckResult {
  const platform = options.platform || 'whatsapp';
  const result = checkContact(identifier, platform);

  // Log the decision (business logic side effect)
  const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
  logDecision(identifier, platform, decision, result.reason);

  return {
    kind: 'contact-check',
    identifier,
    platform,
    allowed: result.allowed,
    trust: result.trust,
    name: result.name,
    reason: result.reason,
  };
}

/**
 * CLI runner - outputs to console and exits with appropriate code
 */
export function runCheck(identifier: string, options: CheckOptions): void {
  const result = doCheckContact(identifier, options);
  output(result, options);
  process.exit(result.allowed ? 0 : 1);
}
