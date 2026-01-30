import { logger } from '../logger.js';
import type { CheckResult, Contact, ContactRow, Platform, TrustLevel } from '../types.js';
import { getDb } from './client.js';

/**
 * Map database row to Contact interface.
 */
function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    identifier: row.identifier,
    platform: row.platform as Platform,
    name: row.name,
    trust: row.trust as TrustLevel,
    addedAt: row.added_at,
    notes: row.notes,
  };
}

export function addContact(
  identifier: string,
  platform: Platform = 'whatsapp',
  trust: TrustLevel = 'trusted',
  name?: string,
  notes?: string
): Contact {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO contacts (identifier, platform, trust, name, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(identifier, platform) DO UPDATE SET
      trust = excluded.trust,
      name = COALESCE(excluded.name, contacts.name),
      notes = COALESCE(excluded.notes, contacts.notes)
  `);

  stmt.run(identifier, platform, trust, name || null, notes || null);

  // Fetch the inserted/updated row
  const row = db
    .prepare('SELECT * FROM contacts WHERE identifier = ? AND platform = ?')
    .get(identifier, platform) as ContactRow | undefined;

  if (!row) {
    throw new Error(`Failed to retrieve contact after insert: ${identifier}`);
  }

  logger.add(identifier, trust);
  return rowToContact(row);
}

export function removeContact(identifier: string, platform: Platform = 'whatsapp'): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM contacts WHERE identifier = ? AND platform = ?');
  const result = stmt.run(identifier, platform);
  if (result.changes > 0) {
    logger.remove(identifier);
  }
  return result.changes > 0;
}

export function getContact(identifier: string, platform: Platform = 'whatsapp'): Contact | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM contacts WHERE identifier = ? AND platform = ?');
  const row = stmt.get(identifier, platform) as ContactRow | undefined;

  if (!row) return null;

  return rowToContact(row);
}

export function listContacts(platform?: Platform, trust?: TrustLevel): Contact[] {
  const db = getDb();

  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params: string[] = [];

  if (platform) {
    query += ' AND platform = ?';
    params.push(platform);
  }

  if (trust) {
    query += ' AND trust = ?';
    params.push(trust);
  }

  query += ' ORDER BY added_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as ContactRow[];

  return rows.map(rowToContact);
}

export function checkContact(identifier: string, platform: Platform = 'whatsapp'): CheckResult {
  const contact = getContact(identifier, platform);

  if (!contact) {
    const result = {
      allowed: false,
      trust: null,
      name: null,
      reason: 'Contact not in whitelist',
    };
    logger.check(identifier, 'DENIED', { platform, reason: result.reason });
    return result;
  }

  if (contact.trust === 'limited') {
    const result = {
      allowed: true,
      trust: 'limited' as const,
      name: contact.name,
      reason: 'Limited trust - agent may view but should not act',
    };
    logger.check(identifier, 'LIMITED', { platform, trust: result.trust, name: result.name });
    return result;
  }

  const result = {
    allowed: true,
    trust: contact.trust,
    name: contact.name,
    reason: 'Contact is trusted',
  };
  logger.check(identifier, 'ALLOWED', { platform, trust: result.trust, name: result.name });
  return result;
}

export function updateTrust(identifier: string, platform: Platform, trust: TrustLevel): boolean {
  const db = getDb();
  const stmt = db.prepare('UPDATE contacts SET trust = ? WHERE identifier = ? AND platform = ?');
  const result = stmt.run(trust, identifier, platform);
  return result.changes > 0;
}
