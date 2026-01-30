import { output } from '../cli/output.js';
import type { AuditLogResult, OutputOptions } from '../cli/types.js';
import { getAuditLog } from '../db/audit.js';

export interface LogOptions extends OutputOptions {
  limit?: number;
  denied?: boolean;
}

/**
 * Get audit log data (testable, no side effects)
 */
export function getAuditLogData(options: Omit<LogOptions, keyof OutputOptions>): AuditLogResult {
  const limit = options.limit || 50;
  const entries = getAuditLog({
    limit,
    decision: options.denied ? 'deny' : undefined,
  });

  return {
    kind: 'audit-log',
    entries,
    count: entries.length,
    filters: {
      limit,
      deniedOnly: options.denied || false,
    },
  };
}

/**
 * CLI runner - outputs to console
 */
export function runLog(options: LogOptions): void {
  const result = getAuditLogData(options);
  output(result, options);
}
