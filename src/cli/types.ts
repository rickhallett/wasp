/**
 * CLI result types - data shapes returned by command handlers
 * These enable --json output and testable data shapes
 */

import type { AuditEntry, Contact, Platform, QuarantinedMessage, TrustLevel } from '../types.js';

// ============================================
// Status results
// ============================================

export interface WaspStatusResult {
  kind: 'status';
  contactCount: number;
  sovereignCount: number;
  trustedCount: number;
  limitedCount: number;
  dataDir: string;
  defaultAction: string;
}

export interface InitResult {
  kind: 'init';
  success: boolean;
  alreadyInitialized: boolean;
  dataDir: string;
  message: string;
}

// ============================================
// Contact results
// ============================================

export interface ContactListResult {
  kind: 'contact-list';
  contacts: Contact[];
  count: number;
}

export interface ContactAddResult {
  kind: 'contact-add';
  contact: Contact;
}

export interface ContactRemoveResult {
  kind: 'contact-remove';
  identifier: string;
  platform: Platform;
  removed: boolean;
}

export interface ContactCheckResult {
  kind: 'contact-check';
  identifier: string;
  platform: Platform;
  allowed: boolean;
  trust: TrustLevel | null;
  name: string | null;
  reason: string;
}

// ============================================
// Audit results
// ============================================

export interface AuditLogResult {
  kind: 'audit-log';
  entries: AuditEntry[];
  count: number;
  filters: {
    limit: number;
    deniedOnly: boolean;
  };
}

export interface BlockedContactsResult {
  kind: 'blocked-contacts';
  contacts: Array<{
    identifier: string;
    platform: Platform;
    lastSeen: string;
    reason: string;
  }>;
  count: number;
}

// ============================================
// Quarantine results
// ============================================

export interface QuarantineListResult {
  kind: 'quarantine-list';
  messages: QuarantinedMessage[];
  bySender: Array<{
    identifier: string;
    platform: Platform;
    messageCount: number;
    firstMessage: QuarantinedMessage;
  }>;
  totalMessages: number;
  senderCount: number;
}

export interface QuarantineApproveResult {
  kind: 'quarantine-approve';
  identifier: string;
  platform: Platform;
  releasedCount: number;
  success: boolean;
}

export interface QuarantineDenyResult {
  kind: 'quarantine-deny';
  identifier: string;
  deletedCount: number;
  success: boolean;
}

// ============================================
// Union type for all results
// ============================================

export type CliResult =
  | WaspStatusResult
  | InitResult
  | ContactListResult
  | ContactAddResult
  | ContactRemoveResult
  | ContactCheckResult
  | AuditLogResult
  | BlockedContactsResult
  | QuarantineListResult
  | QuarantineApproveResult
  | QuarantineDenyResult;

// ============================================
// Output options
// ============================================

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}
