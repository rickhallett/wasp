/**
 * Prompt Injection Canary - Telemetry layer for detecting injection attempts
 *
 * This is telemetry only — it doesn't block messages (the whitelist does that).
 * It provides visibility into attack patterns, especially important for detecting
 * compromised trusted accounts.
 */

import { getDb } from '../db/client.js';
import type { Platform } from '../types.js';

export interface InjectionRisk {
  score: number; // 0.0 (safe) to 1.0 (malicious)
  patterns: string[]; // Which patterns matched
  sensitiveVerbs: string[]; // Which verbs detected
  identifier: string; // Source identifier
  platform: Platform;
  timestamp: string;
}

export interface InjectionTelemetryRow {
  id: number;
  identifier: string;
  platform: string;
  score: number;
  patterns: string | null;
  sensitive_verbs: string | null;
  message_preview: string | null;
  timestamp: string;
}

export interface InjectionStats {
  totalDetections: number;
  highRisk: number; // score > 0.8
  mediumRisk: number; // score > 0.5
  topPatterns: Array<{ pattern: string; count: number }>;
  topIdentifiers: Array<{ identifier: string; count: number }>;
}

// Pattern categories with their detection regexes
const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // Direct command injection
  { name: 'ignore_instructions', pattern: /ignore\s+(previous|all|prior)\s+instructions?/i },
  { name: 'disregard_safety', pattern: /disregard\s+(previous|safety|rules)/i },

  // Authority impersonation
  { name: 'system_tag', pattern: /\[(SYSTEM|ADMIN|ROOT)\]/i },
  { name: 'from_authority', pattern: /(?:from|by):\s*(?:system|admin)/i },

  // Privilege escalation
  { name: 'admin_mode', pattern: /you\s+are\s+now\s+in\s+(admin|root|god)\s+mode/i },
  { name: 'enable_mode', pattern: /enable\s+(debug|admin)\s+mode/i },

  // Boundary breaking
  { name: 'close_tag', pattern: /<\/(?:system|instructions|prompt)>/i },
  { name: 'new_instructions', pattern: /new\s+instructions?:/i },

  // Action forcing
  { name: 'urgent_action', pattern: /URGENT.*ACTION\s+REQUIRED/i },
  { name: 'must_action', pattern: /must\s+(forward|send|execute|delete)/i },

  // Role hijacking
  { name: 'jailbreak', pattern: /(?:DAN|jailbreak|bypass\s+filters?)/i },
  {
    name: 'pretend_mode',
    pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:unrestricted|evil|hacker)/i,
  },
];

// Sensitive action verbs that could indicate malicious intent
const SENSITIVE_VERBS = [
  'forward',
  'send',
  'email',
  'share',
  'upload',
  'delete',
  'remove',
  'destroy',
  'execute',
  'run',
  'install',
  'download',
  'transfer',
  'payment',
  'purchase',
  'grant',
  'allow',
  'authorize',
];

export class PromptInjectionCanary {
  /**
   * Analyze content for potential prompt injection patterns
   */
  analyze(content: string, identifier: string, platform: Platform = 'whatsapp'): InjectionRisk {
    const matchedPatterns: string[] = [];
    const matchedVerbs: string[] = [];

    // Check for injection patterns
    for (const { name, pattern } of INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        matchedPatterns.push(name);
      }
    }

    // Check for sensitive verbs (word boundary matching)
    const lowerContent = content.toLowerCase();
    for (const verb of SENSITIVE_VERBS) {
      const verbPattern = new RegExp(`\\b${verb}\\b`, 'i');
      if (verbPattern.test(lowerContent)) {
        matchedVerbs.push(verb);
      }
    }

    // Calculate score
    let score = 0;

    // Each pattern match: +0.3
    score += matchedPatterns.length * 0.3;

    // Each sensitive verb: +0.1 (cap at 0.3 total for verbs)
    const verbScore = Math.min(matchedVerbs.length * 0.1, 0.3);
    score += verbScore;

    // Cap total score at 1.0
    score = Math.min(score, 1.0);

    return {
      score,
      patterns: matchedPatterns,
      sensitiveVerbs: matchedVerbs,
      identifier,
      platform,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log injection telemetry to the database
   */
  logTelemetry(risk: InjectionRisk, messagePreview?: string): void {
    const db = getDb();
    const preview = messagePreview
      ? messagePreview.slice(0, 200) // Truncate preview to 200 chars
      : null;

    const stmt = db.prepare(
      `INSERT INTO injection_telemetry 
       (identifier, platform, score, patterns, sensitive_verbs, message_preview, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      risk.identifier,
      risk.platform,
      risk.score,
      JSON.stringify(risk.patterns),
      JSON.stringify(risk.sensitiveVerbs),
      preview,
      risk.timestamp
    );
  }

  /**
   * Get recent injection detections
   */
  getRecentDetections(limit = 20): InjectionTelemetryRow[] {
    const db = getDb();
    const stmt = db.prepare(
      `SELECT * FROM injection_telemetry 
       ORDER BY timestamp DESC 
       LIMIT ?`
    );
    return stmt.all(limit) as InjectionTelemetryRow[];
  }

  /**
   * Get aggregate statistics
   */
  getStats(): InjectionStats {
    const db = getDb();

    // Total detections
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM injection_telemetry');
    const totalRow = totalStmt.get() as { count: number } | undefined;
    const totalDetections = totalRow?.count ?? 0;

    // Risk level counts
    const highRiskStmt = db.prepare(
      'SELECT COUNT(*) as count FROM injection_telemetry WHERE score > 0.8'
    );
    const highRiskRow = highRiskStmt.get() as { count: number } | undefined;
    const highRisk = highRiskRow?.count ?? 0;

    const mediumRiskStmt = db.prepare(
      'SELECT COUNT(*) as count FROM injection_telemetry WHERE score > 0.5 AND score <= 0.8'
    );
    const mediumRiskRow = mediumRiskStmt.get() as { count: number } | undefined;
    const mediumRisk = mediumRiskRow?.count ?? 0;

    // Top patterns (need to aggregate from JSON)
    const patternCounts = new Map<string, number>();
    const patternsStmt = db.prepare(
      'SELECT patterns FROM injection_telemetry WHERE patterns IS NOT NULL'
    );
    const rows = patternsStmt.all() as Array<{ patterns: string }>;
    for (const row of rows) {
      try {
        const patterns = JSON.parse(row.patterns) as string[];
        for (const p of patterns) {
          patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
        }
      } catch {
        // Skip malformed JSON
      }
    }
    const topPatterns = Array.from(patternCounts.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top identifiers
    const identifiersStmt = db.prepare(
      `SELECT identifier, COUNT(*) as count 
       FROM injection_telemetry 
       GROUP BY identifier 
       ORDER BY count DESC 
       LIMIT 5`
    );
    const identifierRows = identifiersStmt.all() as Array<{ identifier: string; count: number }>;
    const topIdentifiers = identifierRows.map((r) => ({
      identifier: r.identifier,
      count: r.count,
    }));

    return {
      totalDetections,
      highRisk,
      mediumRisk,
      topPatterns,
      topIdentifiers,
    };
  }

  /**
   * Clear old telemetry entries
   */
  clearOldEntries(daysOld = 30): number {
    const db = getDb();
    const stmt = db.prepare(
      `DELETE FROM injection_telemetry 
       WHERE timestamp < datetime('now', ?)`
    );
    const result = stmt.run(`-${daysOld} days`);
    return result.changes;
  }
}

// Singleton instance
let canaryInstance: PromptInjectionCanary | null = null;

export function getCanary(): PromptInjectionCanary {
  if (!canaryInstance) {
    canaryInstance = new PromptInjectionCanary();
  }
  return canaryInstance;
}

/**
 * Analyze and optionally log injection risk
 * Convenience function for integration points
 */
export function analyzeInjectionRisk(
  content: string,
  identifier: string,
  platform: Platform = 'whatsapp',
  options: { log?: boolean; threshold?: number } = {}
): InjectionRisk {
  const { log = true, threshold = 0.5 } = options;
  const canary = getCanary();
  const risk = canary.analyze(content, identifier, platform);

  if (log && risk.score > threshold) {
    canary.logTelemetry(risk, content);
  }

  return risk;
}
