import { removeContact } from '../db/contacts.js';
import type { Platform } from '../types.js';

export function runRemove(identifier: string, platform: Platform = 'whatsapp'): void {
  const removed = removeContact(identifier, platform);

  if (removed) {
    console.log(`Removed: ${identifier} (${platform})`);
  } else {
    console.log(`Not found: ${identifier} (${platform})`);
  }
}
