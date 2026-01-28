import { getData, saveData } from './client.js';
import type { AuditEntry, Platform } from '../types.js';

let nextAuditId = 1;

function getNextAuditId(): number {
  const data = getData();
  const maxId = data.auditLog.reduce((max, e) => Math.max(max, e.id), 0);
  nextAuditId = maxId + 1;
  return nextAuditId++;
}

export function logDecision(
  identifier: string,
  platform: Platform,
  decision: 'allow' | 'deny' | 'limited',
  reason: string
): void {
  const data = getData();
  
  const entry: AuditEntry = {
    id: getNextAuditId(),
    timestamp: new Date().toISOString(),
    identifier,
    platform,
    decision,
    reason
  };
  
  data.auditLog.push(entry);
  
  // Keep audit log from growing too large (max 1000 entries)
  if (data.auditLog.length > 1000) {
    data.auditLog = data.auditLog.slice(-1000);
  }
  
  saveData();
}

export function getAuditLog(options: {
  limit?: number;
  decision?: 'allow' | 'deny' | 'limited';
  since?: string;
}): AuditEntry[] {
  const data = getData();
  
  let entries = [...data.auditLog];
  
  if (options.decision) {
    entries = entries.filter(e => e.decision === options.decision);
  }
  
  if (options.since) {
    const sinceDate = new Date(options.since);
    entries = entries.filter(e => new Date(e.timestamp) >= sinceDate);
  }
  
  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  if (options.limit) {
    entries = entries.slice(0, options.limit);
  }
  
  return entries;
}

export function clearAuditLog(olderThanDays: number = 30): number {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  
  const initialLength = data.auditLog.length;
  data.auditLog = data.auditLog.filter(
    e => new Date(e.timestamp) >= cutoff
  );
  
  const removed = initialLength - data.auditLog.length;
  if (removed > 0) saveData();
  return removed;
}
