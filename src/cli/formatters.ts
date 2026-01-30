/**
 * CLI formatters - pretty-print logic for each result type
 * Extracted from inline console.log calls for testability
 */

import type {
  AuditLogResult,
  BlockedContactsResult,
  CliResult,
  ContactAddResult,
  ContactCheckResult,
  ContactListResult,
  ContactRemoveResult,
  InitResult,
  QuarantineApproveResult,
  QuarantineDenyResult,
  QuarantineListResult,
  WaspStatusResult,
} from './types.js';

// ============================================
// Main dispatcher
// ============================================

export function formatResult(result: CliResult): string {
  switch (result.kind) {
    case 'status':
      return formatStatus(result);
    case 'init':
      return formatInit(result);
    case 'contact-list':
      return formatContactList(result);
    case 'contact-add':
      return formatContactAdd(result);
    case 'contact-remove':
      return formatContactRemove(result);
    case 'contact-check':
      return formatContactCheck(result);
    case 'audit-log':
      return formatAuditLog(result);
    case 'blocked-contacts':
      return formatBlockedContacts(result);
    case 'quarantine-list':
      return formatQuarantineList(result);
    case 'quarantine-approve':
      return formatQuarantineApprove(result);
    case 'quarantine-deny':
      return formatQuarantineDeny(result);
    default:
      return JSON.stringify(result, null, 2);
  }
}

// ============================================
// Status formatters
// ============================================

export function formatStatus(result: WaspStatusResult): string {
  const lines: string[] = [
    '',
    '🐝 wasp security layer',
    '',
    `Contacts: ${result.contactCount}`,
    `  Sovereign: ${result.sovereignCount}`,
    `  Trusted: ${result.trustedCount}`,
    `  Limited: ${result.limitedCount}`,
    '',
    `Default action: ${result.defaultAction}`,
    `Data directory: ${result.dataDir}`,
    '',
  ];
  return lines.join('\n');
}

export function formatInit(result: InitResult): string {
  if (result.alreadyInitialized) {
    return [
      'wasp is already initialized.',
      `Data directory: ${result.dataDir}`,
      'Use --force to reinitialize.',
    ].join('\n');
  }

  return [
    'wasp initialized successfully.',
    `Data directory: ${result.dataDir}`,
    '',
    'Next steps:',
    '  wasp add "+440123456789" --name "Your Name" --trust sovereign',
    '  wasp list',
    '  wasp serve',
  ].join('\n');
}

// ============================================
// Contact formatters
// ============================================

export function formatContactList(result: ContactListResult): string {
  if (result.count === 0) {
    return 'No contacts found.';
  }

  const lines: string[] = [`Found ${result.count} contact(s):`, ''];

  for (const c of result.contacts) {
    const name = c.name ? ` (${c.name})` : '';
    lines.push(`  ${c.identifier}${name}`);
    lines.push(`    Platform: ${c.platform} | Trust: ${c.trust}`);
    if (c.notes) lines.push(`    Notes: ${c.notes}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatContactAdd(result: ContactAddResult): string {
  const c = result.contact;
  const lines: string[] = [
    'Contact added/updated:',
    `  Identifier: ${c.identifier}`,
    `  Platform:   ${c.platform}`,
    `  Trust:      ${c.trust}`,
  ];
  if (c.name) lines.push(`  Name:       ${c.name}`);
  if (c.notes) lines.push(`  Notes:      ${c.notes}`);
  return lines.join('\n');
}

export function formatContactRemove(result: ContactRemoveResult): string {
  if (result.removed) {
    return `Removed: ${result.identifier}`;
  }
  return `Not found: ${result.identifier}`;
}

export function formatContactCheck(result: ContactCheckResult): string {
  if (result.allowed) {
    const name = result.name ? ` (${result.name})` : '';
    const lines = [`ALLOWED: ${result.identifier}${name}`, `  Trust level: ${result.trust}`];
    if (result.trust === 'limited') {
      lines.push('  Note: Limited trust - agent may view but should not act');
    }
    return lines.join('\n');
  }

  return [`DENIED: ${result.identifier}`, `  Reason: ${result.reason}`].join('\n');
}

// ============================================
// Audit formatters
// ============================================

export function formatAuditLog(result: AuditLogResult): string {
  if (result.count === 0) {
    return 'No audit entries found.';
  }

  const lines: string[] = [`Last ${result.count} audit entries:`, ''];

  for (const e of result.entries) {
    const icon = e.decision === 'allow' ? '✓' : e.decision === 'limited' ? '~' : '✗';
    lines.push(`  ${icon} ${e.timestamp} | ${e.identifier} (${e.platform})`);
    lines.push(`    Decision: ${e.decision} - ${e.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatBlockedContacts(result: BlockedContactsResult): string {
  if (result.count === 0) {
    return '\nNo blocked contacts in recent history.\n';
  }

  const lines: string[] = ['', '🐝 Recently Blocked Contacts', '', '─'.repeat(60), ''];

  for (const c of result.contacts) {
    lines.push(`  ${c.identifier} (${c.platform})`);
    lines.push(`    Last seen: ${c.lastSeen}`);
    lines.push(`    Reason: ${c.reason}`);
    lines.push('');
  }

  lines.push('─'.repeat(60));
  lines.push('');
  lines.push('To allow a contact:');
  lines.push('  wasp add "<identifier>" --trust trusted');
  lines.push('');

  return lines.join('\n');
}

// ============================================
// Quarantine formatters
// ============================================

export function formatQuarantineList(result: QuarantineListResult): string {
  if (result.totalMessages === 0) {
    return '\n🐝 Quarantine is empty - no messages awaiting review\n';
  }

  const lines: string[] = [
    '',
    '🐝 Quarantine Review',
    '',
    `${result.senderCount} sender(s), ${result.totalMessages} message(s) awaiting review`,
    '',
    '─'.repeat(60),
    '',
  ];

  let index = 1;
  for (const sender of result.bySender) {
    lines.push(`${index}. ${sender.identifier} (${sender.platform})`);
    lines.push(`   ${sender.messageCount} message(s)`);
    lines.push('');
    lines.push(`   First: "${sender.firstMessage.messagePreview}"`);
    lines.push(`   Time:  ${sender.firstMessage.timestamp}`);
    lines.push('');
    index++;
  }

  lines.push('─'.repeat(60));
  lines.push('');
  lines.push('Actions:');
  lines.push('  wasp review --approve <identifier>   Add to trusted, release messages');
  lines.push('  wasp review --deny <identifier>      Block sender, delete messages');
  lines.push('');

  return lines.join('\n');
}

export function formatQuarantineApprove(result: QuarantineApproveResult): string {
  if (!result.success) {
    return `No quarantined messages for: ${result.identifier}`;
  }
  return [
    `✓ Approved ${result.identifier}`,
    `  Released ${result.releasedCount} quarantined message(s)`,
  ].join('\n');
}

export function formatQuarantineDeny(result: QuarantineDenyResult): string {
  if (!result.success) {
    return `No quarantined messages for: ${result.identifier}`;
  }
  return [`✗ Denied ${result.identifier}`, `  Deleted ${result.deletedCount} message(s)`].join(
    '\n'
  );
}
