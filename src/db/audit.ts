import type { AuditEntry, AuditRow, Decision, Platform } from '../types.js';
import { getDb } from './client.js';

/**
 * Map database row to AuditEntry interface.
 */
function rowToAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    identifier: row.identifier,
    platform: row.platform as Platform,
    decision: row.decision as Decision,
    reason: row.reason || '',
  };
}

export function logDecision(
  identifier: string,
  platform: Platform,
  decision: Decision,
  reason: string
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_log (identifier, platform, decision, reason)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(identifier, platform, decision, reason);
}

export function getAuditLog(options: {
  limit?: number;
  decision?: Decision;
  since?: string;
}): AuditEntry[] {
  const db = getDb();

  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params: (string | number)[] = [];

  if (options.decision) {
    query += ' AND decision = ?';
    params.push(options.decision);
  }

  if (options.since) {
    query += ' AND timestamp >= ?';
    params.push(options.since);
  }

  query += ' ORDER BY timestamp DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as AuditRow[];

  return rows.map(rowToAuditEntry);
}

export function clearAuditLog(olderThanDays: number = 30): number {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM audit_log 
    WHERE timestamp < datetime('now', '-' || ? || ' days')
  `);
  const result = stmt.run(olderThanDays);
  return result.changes;
}
