import { getData, saveData } from './client.js';
import type { Contact, Platform, TrustLevel, CheckResult } from '../types.js';

let nextId = 1;

function getNextId(): number {
  const data = getData();
  const maxId = data.contacts.reduce((max, c) => Math.max(max, c.id), 0);
  nextId = maxId + 1;
  return nextId++;
}

export function addContact(
  identifier: string,
  platform: Platform = 'whatsapp',
  trust: TrustLevel = 'trusted',
  name?: string,
  notes?: string
): Contact {
  const data = getData();
  
  // Check if exists
  const existingIndex = data.contacts.findIndex(
    c => c.identifier === identifier && c.platform === platform
  );
  
  if (existingIndex >= 0) {
    // Update existing
    const existing = data.contacts[existingIndex];
    existing.trust = trust;
    if (name) existing.name = name;
    if (notes) existing.notes = notes;
    saveData();
    return existing;
  }
  
  // Create new
  const contact: Contact = {
    id: getNextId(),
    identifier,
    platform,
    name: name || null,
    trust,
    addedAt: new Date().toISOString(),
    notes: notes || null
  };
  
  data.contacts.push(contact);
  saveData();
  return contact;
}

export function removeContact(identifier: string, platform: Platform = 'whatsapp'): boolean {
  const data = getData();
  const initialLength = data.contacts.length;
  
  data.contacts = data.contacts.filter(
    c => !(c.identifier === identifier && c.platform === platform)
  );
  
  const removed = data.contacts.length < initialLength;
  if (removed) saveData();
  return removed;
}

export function getContact(identifier: string, platform: Platform = 'whatsapp'): Contact | null {
  const data = getData();
  return data.contacts.find(
    c => c.identifier === identifier && c.platform === platform
  ) || null;
}

export function listContacts(platform?: Platform, trust?: TrustLevel): Contact[] {
  const data = getData();
  
  return data.contacts.filter(c => {
    if (platform && c.platform !== platform) return false;
    if (trust && c.trust !== trust) return false;
    return true;
  }).sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
}

export function checkContact(identifier: string, platform: Platform = 'whatsapp'): CheckResult {
  const contact = getContact(identifier, platform);
  
  if (!contact) {
    return {
      allowed: false,
      trust: null,
      name: null,
      reason: 'Contact not in whitelist'
    };
  }
  
  if (contact.trust === 'limited') {
    return {
      allowed: true,
      trust: 'limited',
      name: contact.name,
      reason: 'Limited trust - agent may view but should not act'
    };
  }
  
  return {
    allowed: true,
    trust: contact.trust,
    name: contact.name,
    reason: 'Contact is trusted'
  };
}

export function updateTrust(identifier: string, platform: Platform, trust: TrustLevel): boolean {
  const data = getData();
  const contact = data.contacts.find(
    c => c.identifier === identifier && c.platform === platform
  );
  
  if (!contact) return false;
  
  contact.trust = trust;
  saveData();
  return true;
}
