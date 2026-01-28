export type Platform = 'whatsapp' | 'telegram' | 'email' | 'discord' | 'slack' | 'signal';

export type TrustLevel = 'sovereign' | 'trusted' | 'limited';

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
  decision: 'allow' | 'deny' | 'limited';
  reason: string;
}
