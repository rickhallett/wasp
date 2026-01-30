import { output } from '../cli/output.js';
import type { InitResult, OutputOptions } from '../cli/types.js';
import { getDataDir, initSchema, isInitialized } from '../db/client.js';

export interface InitOptions extends OutputOptions {
  force?: boolean;
}

/**
 * Initialize wasp and return result data (testable)
 */
export function doInit(options: Omit<InitOptions, keyof OutputOptions>): InitResult {
  const dataDir = getDataDir();

  if (isInitialized() && !options.force) {
    return {
      kind: 'init',
      success: true,
      alreadyInitialized: true,
      dataDir,
      message: 'wasp is already initialized.',
    };
  }

  initSchema();

  return {
    kind: 'init',
    success: true,
    alreadyInitialized: false,
    dataDir,
    message: 'wasp initialized successfully.',
  };
}

/**
 * CLI runner - outputs to console
 */
export function runInit(force: boolean = false, options: OutputOptions = {}): void {
  const result = doInit({ force });
  output(result, options);
}
