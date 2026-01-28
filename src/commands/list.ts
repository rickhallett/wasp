import { listContacts } from '../db/contacts.js';
import type { Platform, TrustLevel } from '../types.js';

export function runList(options: {
  platform?: Platform;
  trust?: TrustLevel;
  json?: boolean;
}): void {
  const contacts = listContacts(options.platform, options.trust);

  if (contacts.length === 0) {
    console.log('No contacts found.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }

  console.log(`Found ${contacts.length} contact(s):\n`);
  
  for (const c of contacts) {
    const name = c.name ? ` (${c.name})` : '';
    console.log(`  ${c.identifier}${name}`);
    console.log(`    Platform: ${c.platform} | Trust: ${c.trust}`);
    if (c.notes) console.log(`    Notes: ${c.notes}`);
    console.log('');
  }
}
