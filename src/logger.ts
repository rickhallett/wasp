/**
 * wasp file logger
 *
 * Usage:
 *   import { log, logInfo, logWarn, logError } from './logger.js';
 *   log('check', '+447375862225', 'allowed', { trust: 'sovereign' });
 *
 * Watch in real-time:
 *   tail -f ~/.wasp/wasp.log
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG_DIR = process.env.WASP_DATA_DIR || join(homedir(), '.wasp');
const LOG_FILE = join(LOG_DIR, 'wasp.log');

// Ensure log directory exists (wrapped in try/catch for test environments)
try {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
} catch {
  // Ignore in test environments
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(
  level: LogLevel,
  category: string,
  message: string,
  data?: Record<string, unknown>
): string {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] [${category}] ${message}${dataStr}\n`;
}

function safeAppend(line: string): void {
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore write errors in test environments
  }
}

export function log(category: string, message: string, data?: Record<string, unknown>): void {
  const line = formatMessage('INFO', category, message, data);
  safeAppend(line);
  if (process.env.WASP_DEBUG) {
    process.stdout.write(line);
  }
}

export function logDebug(category: string, message: string, data?: Record<string, unknown>): void {
  if (process.env.WASP_DEBUG) {
    const line = formatMessage('DEBUG', category, message, data);
    safeAppend(line);
    process.stdout.write(line);
  }
}

export function logInfo(category: string, message: string, data?: Record<string, unknown>): void {
  log(category, message, data);
}

export function logWarn(category: string, message: string, data?: Record<string, unknown>): void {
  const line = formatMessage('WARN', category, message, data);
  safeAppend(line);
  if (process.env.WASP_DEBUG) {
    process.stderr.write(line);
  }
}

export function logError(category: string, message: string, data?: Record<string, unknown>): void {
  const line = formatMessage('ERROR', category, message, data);
  safeAppend(line);
  process.stderr.write(line);
}

// Convenience functions for common operations
export const logger = {
  check: (identifier: string, result: string, data?: Record<string, unknown>) =>
    log('check', `${identifier} → ${result}`, data),

  add: (identifier: string, trust: string) => log('contacts', `added ${identifier}`, { trust }),

  remove: (identifier: string) => log('contacts', `removed ${identifier}`),

  block: (identifier: string, reason: string) => logWarn('block', `${identifier}: ${reason}`),

  tool: (tool: string, action: 'allow' | 'block', data?: Record<string, unknown>) =>
    log('tool', `${tool} → ${action}`, data),

  plugin: (event: string, data?: Record<string, unknown>) => log('plugin', event, data),

  server: (event: string, data?: Record<string, unknown>) => log('server', event, data),
};

export function getLogPath(): string {
  return LOG_FILE;
}
