import { output } from '../cli/output.js';
import type {
  BlockedContactsResult,
  OutputOptions,
  QuarantineApproveResult,
  QuarantineDenyResult,
  QuarantineListResult,
} from '../cli/types.js';
import { getAuditLog } from '../db/audit.js';
import { addContact } from '../db/contacts.js';
import { deleteQuarantined, getQuarantined, releaseQuarantined } from '../db/quarantine.js';

export interface ReviewOptions extends OutputOptions {
  approve?: string;
  deny?: string;
  interactive?: boolean;
}

/**
 * Approve a quarantined sender and release their messages
 */
export function doApproveQuarantined(identifier: string): QuarantineApproveResult {
  const messages = releaseQuarantined(identifier);

  if (messages.length > 0) {
    addContact(messages[0].identifier, messages[0].platform, 'trusted');
    return {
      kind: 'quarantine-approve',
      identifier: messages[0].identifier,
      platform: messages[0].platform,
      releasedCount: messages.length,
      success: true,
    };
  }

  return {
    kind: 'quarantine-approve',
    identifier,
    platform: 'whatsapp', // Default, unknown
    releasedCount: 0,
    success: false,
  };
}

/**
 * Deny a quarantined sender and delete their messages
 */
export function doDenyQuarantined(identifier: string): QuarantineDenyResult {
  const deleted = deleteQuarantined(identifier);

  if (deleted > 0) {
    addContact(identifier, 'whatsapp', 'limited'); // Add as blocked/limited
    return {
      kind: 'quarantine-deny',
      identifier,
      deletedCount: deleted,
      success: true,
    };
  }

  return {
    kind: 'quarantine-deny',
    identifier,
    deletedCount: 0,
    success: false,
  };
}

/**
 * Get quarantine list data
 */
export function getQuarantineList(limit: number = 50): QuarantineListResult {
  const quarantined = getQuarantined(limit);

  // Group by sender
  const bySenderMap = new Map<
    string,
    { identifier: string; platform: string; messages: (typeof quarantined)[0][] }
  >();

  for (const msg of quarantined) {
    const key = `${msg.identifier}|${msg.platform}`;
    if (!bySenderMap.has(key)) {
      bySenderMap.set(key, { identifier: msg.identifier, platform: msg.platform, messages: [] });
    }
    bySenderMap.get(key)?.messages.push(msg);
  }

  const bySender = Array.from(bySenderMap.values()).map((group) => ({
    identifier: group.identifier,
    platform: group.platform as ReturnType<typeof getQuarantined>[0]['platform'],
    messageCount: group.messages.length,
    firstMessage: group.messages[0],
  }));

  return {
    kind: 'quarantine-list',
    messages: quarantined,
    bySender,
    totalMessages: quarantined.length,
    senderCount: bySender.length,
  };
}

/**
 * Get blocked contacts data
 */
export function getBlockedContacts(limit: number = 20): BlockedContactsResult {
  const entries = getAuditLog({ limit: 100, decision: 'deny' });

  // Get unique identifiers
  const seen = new Set<string>();
  const contacts: BlockedContactsResult['contacts'] = [];

  for (const e of entries) {
    const key = `${e.identifier}|${e.platform}`;
    if (!seen.has(key)) {
      seen.add(key);
      contacts.push({
        identifier: e.identifier,
        platform: e.platform,
        lastSeen: e.timestamp,
        reason: e.reason,
      });
      if (contacts.length >= limit) break;
    }
  }

  return {
    kind: 'blocked-contacts',
    contacts,
    count: contacts.length,
  };
}

/**
 * CLI runner for review command
 */
export async function runReview(options: ReviewOptions): Promise<void> {
  if (options.approve) {
    const result = doApproveQuarantined(options.approve);
    output(result, options);
    return;
  }

  if (options.deny) {
    const result = doDenyQuarantined(options.deny);
    output(result, options);
    return;
  }

  // Show quarantine summary
  const result = getQuarantineList();
  output(result, options);

  // If interactive mode requested, we could add readline here
  if (options.interactive && result.totalMessages > 0) {
    console.log('Interactive mode not yet implemented.');
    console.log('Use --approve or --deny flags for now.');
  }
}

/**
 * CLI runner for blocked command - shows first-time blocked contacts
 */
export function showFirstTimeContacts(limit: number = 20, options: OutputOptions = {}): void {
  const result = getBlockedContacts(limit);
  output(result, options);
}
