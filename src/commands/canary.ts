/**
 * CLI command for viewing prompt injection telemetry
 */

import { getCanary, type InjectionStats, type InjectionTelemetryRow } from '../canary/injection.js';
import { output } from '../cli/output.js';
import type { OutputOptions } from '../cli/types.js';

export interface CanaryListResult {
  kind: 'canary-list';
  detections: InjectionTelemetryRow[];
  count: number;
}

export interface CanaryStatsResult {
  kind: 'canary-stats';
  stats: InjectionStats;
}

export interface CanaryClearResult {
  kind: 'canary-clear';
  deleted: number;
  daysOld: number;
}

export interface CanaryOptions extends OutputOptions {
  stats?: boolean;
  clear?: boolean;
  days?: number;
  limit?: number;
}

function formatScore(score: number): string {
  if (score > 0.8) return `🔴 ${score.toFixed(2)} HIGH`;
  if (score > 0.5) return `🟡 ${score.toFixed(2)} MEDIUM`;
  return `🟢 ${score.toFixed(2)} LOW`;
}

function formatDetection(row: InjectionTelemetryRow): void {
  console.log(`\n┌─ ${row.timestamp}`);
  console.log(`│ From: ${row.identifier} (${row.platform})`);
  console.log(`│ Risk: ${formatScore(row.score)}`);

  try {
    const patterns = JSON.parse(row.patterns || '[]') as string[];
    if (patterns.length > 0) {
      console.log(`│ Patterns: ${patterns.join(', ')}`);
    }
  } catch {
    // Skip
  }

  try {
    const verbs = JSON.parse(row.sensitive_verbs || '[]') as string[];
    if (verbs.length > 0) {
      console.log(`│ Verbs: ${verbs.join(', ')}`);
    }
  } catch {
    // Skip
  }

  if (row.message_preview) {
    console.log(
      `│ Preview: "${row.message_preview.slice(0, 80)}${row.message_preview.length > 80 ? '...' : ''}"`
    );
  }
  console.log('└─');
}

function formatStats(stats: InjectionStats): void {
  console.log('\n📊 Injection Telemetry Statistics\n');
  console.log(`Total detections: ${stats.totalDetections}`);
  console.log(`High risk (>0.8): ${stats.highRisk}`);
  console.log(`Medium risk (>0.5): ${stats.mediumRisk}`);

  if (stats.topPatterns.length > 0) {
    console.log('\n🎯 Top Patterns:');
    for (const { pattern, count } of stats.topPatterns) {
      console.log(`  ${pattern}: ${count}`);
    }
  }

  if (stats.topIdentifiers.length > 0) {
    console.log('\n👤 Top Sources:');
    for (const { identifier, count } of stats.topIdentifiers) {
      console.log(`  ${identifier}: ${count}`);
    }
  }
}

export function runCanary(options: CanaryOptions): void {
  const canary = getCanary();

  if (options.clear) {
    const daysOld = options.days ?? 30;
    const deleted = canary.clearOldEntries(daysOld);
    const result: CanaryClearResult = {
      kind: 'canary-clear',
      deleted,
      daysOld,
    };

    if (options.json) {
      output(result, options);
    } else {
      console.log(`🧹 Cleared ${deleted} entries older than ${daysOld} days`);
    }
    return;
  }

  if (options.stats) {
    const stats = canary.getStats();
    const result: CanaryStatsResult = {
      kind: 'canary-stats',
      stats,
    };

    if (options.json) {
      output(result, options);
    } else {
      formatStats(stats);
    }
    return;
  }

  // Default: list recent detections
  const limit = options.limit ?? 20;
  const detections = canary.getRecentDetections(limit);
  const result: CanaryListResult = {
    kind: 'canary-list',
    detections,
    count: detections.length,
  };

  if (options.json) {
    output(result, options);
  } else {
    if (detections.length === 0) {
      console.log('✨ No injection attempts detected');
    } else {
      console.log(`\n🐦 Recent Injection Detections (${detections.length})`);
      for (const detection of detections) {
        formatDetection(detection);
      }
    }
  }
}
