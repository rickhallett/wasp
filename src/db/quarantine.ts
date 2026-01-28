import type { Platform, QuarantinedMessage, QuarantineRow } from '../types.js';
import { getDb } from './client.js';

/**
 * Map database row to QuarantinedMessage interface.
 */
function rowToQuarantinedMessage(row: QuarantineRow): QuarantinedMessage {
  return {
    id: row.id,
    identifier: row.identifier,
    platform: row.platform as Platform,
    messagePreview: row.message_preview || '',
    fullMessage: row.full_message || '',
    timestamp: row.timestamp,
    reviewed: !!row.reviewed,
  };
}

export function quarantineMessage(identifier: string, platform: Platform, message: string): void {
  const db = getDb();

  const preview = message.length > 100 ? `${message.slice(0, 100)}...` : message;

  const stmt = db.prepare(`
    INSERT INTO quarantine (identifier, platform, message_preview, full_message)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(identifier, platform, preview, message);
}

export function getQuarantined(limit: number = 50): QuarantinedMessage[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT * FROM quarantine 
    WHERE reviewed = 0 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
  const rows = stmt.all(limit) as QuarantineRow[];

  return rows.map(rowToQuarantinedMessage);
}

export function getQuarantinedByIdentifier(
  identifier: string,
  platform: Platform = 'whatsapp'
): QuarantinedMessage[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT * FROM quarantine 
    WHERE identifier = ? AND platform = ? AND reviewed = 0
    ORDER BY timestamp ASC
  `);
  const rows = stmt.all(identifier, platform) as QuarantineRow[];

  return rows.map(rowToQuarantinedMessage);
}

export function releaseQuarantined(
  identifier: string,
  platform: Platform = 'whatsapp'
): QuarantinedMessage[] {
  const messages = getQuarantinedByIdentifier(identifier, platform);

  if (messages.length > 0) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE quarantine SET reviewed = 1 
      WHERE identifier = ? AND platform = ?
    `);
    stmt.run(identifier, platform);
  }

  return messages;
}

export function deleteQuarantined(identifier: string, platform: Platform = 'whatsapp'): number {
  const db = getDb();

  const stmt = db.prepare(`
    DELETE FROM quarantine WHERE identifier = ? AND platform = ?
  `);
  const result = stmt.run(identifier, platform);
  return result.changes;
}

export function clearOldQuarantine(olderThanDays: number = 30): number {
  const db = getDb();

  const stmt = db.prepare(`
    DELETE FROM quarantine 
    WHERE timestamp < datetime('now', '-' || ? || ' days')
  `);
  const result = stmt.run(olderThanDays);
  return result.changes;
}
