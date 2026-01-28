import { getQuarantined, releaseQuarantined, deleteQuarantined } from '../db/quarantine.js';
import { addContact } from '../db/contacts.js';
import { getAuditLog } from '../db/audit.js';
import type { Platform } from '../types.js';

interface ReviewOptions {
  approve?: string;
  deny?: string;
  interactive?: boolean;
}

export async function runReview(options: ReviewOptions): Promise<void> {
  // Handle direct approve/deny
  if (options.approve) {
    const messages = releaseQuarantined(options.approve);
    if (messages.length > 0) {
      addContact(messages[0].identifier, messages[0].platform, 'trusted');
      console.log(`✓ Approved ${messages[0].identifier}`);
      console.log(`  Released ${messages.length} quarantined message(s)`);
    } else {
      console.log(`No quarantined messages for: ${options.approve}`);
    }
    return;
  }

  if (options.deny) {
    const deleted = deleteQuarantined(options.deny);
    if (deleted > 0) {
      addContact(options.deny, 'whatsapp', 'limited'); // Add as blocked/limited
      console.log(`✗ Denied ${options.deny}`);
      console.log(`  Deleted ${deleted} message(s)`);
    } else {
      console.log(`No quarantined messages for: ${options.deny}`);
    }
    return;
  }

  // Show quarantine summary
  const quarantined = getQuarantined(50);
  
  if (quarantined.length === 0) {
    console.log('\n🐝 Quarantine is empty - no messages awaiting review\n');
    return;
  }

  // Group by sender
  const bySender = new Map<string, typeof quarantined>();
  for (const msg of quarantined) {
    const key = `${msg.identifier}|${msg.platform}`;
    if (!bySender.has(key)) {
      bySender.set(key, []);
    }
    bySender.get(key)!.push(msg);
  }

  console.log(`\n🐝 Quarantine Review\n`);
  console.log(`${bySender.size} sender(s), ${quarantined.length} message(s) awaiting review\n`);
  console.log('─'.repeat(60) + '\n');

  let index = 1;
  for (const [key, messages] of bySender) {
    const [identifier, platform] = key.split('|');
    console.log(`${index}. ${identifier} (${platform})`);
    console.log(`   ${messages.length} message(s)`);
    console.log('');
    
    // Show preview of first message
    const first = messages[0];
    console.log(`   First: "${first.messagePreview}"`);
    console.log(`   Time:  ${first.timestamp}`);
    console.log('');
    
    index++;
  }

  console.log('─'.repeat(60));
  console.log('\nActions:');
  console.log('  wasp review --approve <identifier>   Add to trusted, release messages');
  console.log('  wasp review --deny <identifier>      Block sender, delete messages');
  console.log('');

  // If interactive mode requested, we could add readline here
  if (options.interactive) {
    console.log('Interactive mode not yet implemented.');
    console.log('Use --approve or --deny flags for now.');
  }
}

// Show first-time contacts from audit log (not in quarantine)
export function showFirstTimeContacts(limit: number = 20): void {
  const entries = getAuditLog({ limit: 100, decision: 'deny' });
  
  // Get unique identifiers
  const seen = new Set<string>();
  const unique: typeof entries = [];
  
  for (const e of entries) {
    const key = `${e.identifier}|${e.platform}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
      if (unique.length >= limit) break;
    }
  }

  if (unique.length === 0) {
    console.log('\nNo blocked contacts in recent history.\n');
    return;
  }

  console.log(`\n🐝 Recently Blocked Contacts\n`);
  console.log('─'.repeat(60) + '\n');

  for (const e of unique) {
    console.log(`  ${e.identifier} (${e.platform})`);
    console.log(`    Last seen: ${e.timestamp}`);
    console.log(`    Reason: ${e.reason}`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('\nTo allow a contact:');
  console.log('  wasp add "<identifier>" --trust trusted');
  console.log('');
}
