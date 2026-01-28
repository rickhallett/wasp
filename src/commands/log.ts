import { getAuditLog } from '../db/audit.js';

export function runLog(options: {
  limit?: number;
  denied?: boolean;
  json?: boolean;
}): void {
  const entries = getAuditLog({
    limit: options.limit || 50,
    decision: options.denied ? 'deny' : undefined
  });

  if (entries.length === 0) {
    console.log('No audit entries found.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`Last ${entries.length} audit entries:\n`);
  
  for (const e of entries) {
    const icon = e.decision === 'allow' ? '✓' : e.decision === 'limited' ? '~' : '✗';
    console.log(`  ${icon} ${e.timestamp} | ${e.identifier} (${e.platform})`);
    console.log(`    Decision: ${e.decision} - ${e.reason}`);
    console.log('');
  }
}
