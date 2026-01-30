import { output } from '../cli/output.js';
import type { ContactRemoveResult, OutputOptions } from '../cli/types.js';
import { removeContact } from '../db/contacts.js';
import type { Platform } from '../types.js';

export interface RemoveOptions extends OutputOptions {
  platform?: Platform;
}

/**
 * Remove a contact and return result data (testable)
 */
export function doRemoveContact(
  identifier: string,
  platform: Platform = 'whatsapp'
): ContactRemoveResult {
  const removed = removeContact(identifier, platform);

  return {
    kind: 'contact-remove',
    identifier,
    platform,
    removed,
  };
}

/**
 * CLI runner - outputs to console
 */
export function runRemove(
  identifier: string,
  platform: Platform = 'whatsapp',
  options: OutputOptions = {}
): void {
  const result = doRemoveContact(identifier, platform);
  output(result, options);
}
