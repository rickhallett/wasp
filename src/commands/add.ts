import { output } from '../cli/output.js';
import type { ContactAddResult, OutputOptions } from '../cli/types.js';
import { addContact } from '../db/contacts.js';
import type { Platform, TrustLevel } from '../types.js';

export interface AddOptions extends OutputOptions {
  platform?: Platform;
  trust?: TrustLevel;
  name?: string;
  notes?: string;
}

/**
 * Add a contact and return result data (testable, no side effects)
 */
export function doAddContact(
  identifier: string,
  options: Omit<AddOptions, keyof OutputOptions>
): ContactAddResult {
  const contact = addContact(
    identifier,
    options.platform || 'whatsapp',
    options.trust || 'trusted',
    options.name,
    options.notes
  );

  return {
    kind: 'contact-add',
    contact,
  };
}

/**
 * CLI runner - outputs to console
 */
export function runAdd(identifier: string, options: AddOptions): void {
  const result = doAddContact(identifier, options);
  output(result, options);
}
