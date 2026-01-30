/**
 * CLI output dispatcher
 * Routes result data to JSON or pretty formatters based on options
 */

import { formatResult } from './formatters.js';
import type { CliResult, OutputOptions } from './types.js';

/**
 * Output a CLI result
 * Dispatches to JSON.stringify or pretty formatter based on options
 */
export function output<T extends CliResult>(data: T, opts: OutputOptions = {}): void {
  if (opts.quiet) {
    return;
  }

  if (opts.json) {
    // Strip the 'kind' discriminator for cleaner JSON output
    const { kind, ...rest } = data;
    console.log(JSON.stringify(rest, null, 2));
    return;
  }

  const formatted = formatResult(data);
  console.log(formatted);
}

/**
 * Output raw data (for results without specific formatting)
 */
export function outputRaw(data: unknown, opts: OutputOptions = {}): void {
  if (opts.quiet) {
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(data);
}
