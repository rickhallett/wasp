import { output } from '../cli/output.js';
import type { ContactListResult, OutputOptions } from '../cli/types.js';
import { listContacts } from '../db/contacts.js';
import type { Platform, TrustLevel } from '../types.js';

export interface ListOptions extends OutputOptions {
  platform?: Platform;
  trust?: TrustLevel;
}

/**
 * Get contact list data (testable, no side effects)
 */
export function getContactList(options: Omit<ListOptions, keyof OutputOptions>): ContactListResult {
  const contacts = listContacts(options.platform, options.trust);
  return {
    kind: 'contact-list',
    contacts,
    count: contacts.length,
  };
}

/**
 * CLI runner - outputs to console
 */
export function runList(options: ListOptions): void {
  const result = getContactList(options);
  output(result, options);
}
