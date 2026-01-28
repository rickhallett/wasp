import { checkContact } from '../db/contacts.js';
import { logDecision } from '../db/audit.js';
import type { Platform } from '../types.js';

export function runCheck(
  identifier: string,
  options: {
    platform?: Platform;
    json?: boolean;
    quiet?: boolean;
  }
): void {
  const platform = options.platform || 'whatsapp';
  const result = checkContact(identifier, platform);

  // Log the decision
  const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
  logDecision(identifier, platform, decision, result.reason);

  if (options.json) {
    console.log(JSON.stringify(result));
    process.exit(result.allowed ? 0 : 1);
    return;
  }

  if (options.quiet) {
    process.exit(result.allowed ? 0 : 1);
    return;
  }

  if (result.allowed) {
    const name = result.name ? ` (${result.name})` : '';
    console.log(`ALLOWED: ${identifier}${name}`);
    console.log(`  Trust level: ${result.trust}`);
    if (result.trust === 'limited') {
      console.log('  Note: Limited trust - agent may view but should not act');
    }
  } else {
    console.log(`DENIED: ${identifier}`);
    console.log(`  Reason: ${result.reason}`);
  }

  process.exit(result.allowed ? 0 : 1);
}
