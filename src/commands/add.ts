import { addContact } from '../db/contacts.js';
import type { Platform, TrustLevel } from '../types.js';

export function runAdd(
  identifier: string,
  options: {
    platform?: Platform;
    trust?: TrustLevel;
    name?: string;
    notes?: string;
  }
): void {
  const contact = addContact(
    identifier,
    options.platform || 'whatsapp',
    options.trust || 'trusted',
    options.name,
    options.notes
  );

  console.log('Contact added/updated:');
  console.log(`  Identifier: ${contact.identifier}`);
  console.log(`  Platform:   ${contact.platform}`);
  console.log(`  Trust:      ${contact.trust}`);
  if (contact.name) console.log(`  Name:       ${contact.name}`);
  if (contact.notes) console.log(`  Notes:      ${contact.notes}`);
}
