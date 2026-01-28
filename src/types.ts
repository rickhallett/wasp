// Core types
export type Platform = 'whatsapp' | 'telegram' | 'email' | 'discord' | 'slack' | 'signal' | 'webchat';

export type TrustLevel = 'sovereign' | 'trusted' | 'limited';

export type Decision = 'allow' | 'deny' | 'limited';

// API types
export interface Contact {
  id: number;
  identifier: string;
  platform: Platform;
  name: string | null;
  trust: TrustLevel;
  addedAt: string;
  notes: string | null;
}

export interface CheckResult {
  allowed: boolean;
  trust: TrustLevel | null;
  name: string | null;
  reason: string;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  identifier: string;
  platform: Platform;
  decision: Decision;
  reason: string;
}

export interface QuarantinedMessage {
  id: number;
  identifier: string;
  platform: Platform;
  messagePreview: string;
  fullMessage: string;
  timestamp: string;
  reviewed: boolean;
}

// Database row types (internal - match SQLite column names)
export interface ContactRow {
  id: number;
  identifier: string;
  platform: string;
  name: string | null;
  trust: string;
  added_at: string;
  notes: string | null;
}

export interface AuditRow {
  id: number;
  timestamp: string;
  identifier: string;
  platform: string;
  decision: string;
  reason: string | null;
}

export interface QuarantineRow {
  id: number;
  identifier: string;
  platform: string;
  message_preview: string | null;
  full_message: string | null;
  timestamp: string;
  reviewed: number;
}

// Constants
export const VALID_PLATFORMS: readonly Platform[] = [
  'whatsapp', 'telegram', 'email', 'discord', 'slack', 'signal', 'webchat'
] as const;

export const VALID_TRUST_LEVELS: readonly TrustLevel[] = [
  'sovereign', 'trusted', 'limited'
] as const;
