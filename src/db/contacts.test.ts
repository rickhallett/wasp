import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'wasp-test-contacts-' + Date.now());
process.env.WASP_DATA_DIR = TEST_DIR;

import { initSchema, closeDb, resetCache } from './client.js';
import { addContact, removeContact, getContact, listContacts, checkContact, updateTrust } from './contacts.js';

describe('db/contacts', () => {
  beforeAll(() => {
    resetCache();
    initSchema();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should add a contact', () => {
    const contact = addContact('+440123456789', 'whatsapp', 'sovereign', 'Kai');
    
    expect(contact.identifier).toBe('+440123456789');
    expect(contact.platform).toBe('whatsapp');
    expect(contact.trust).toBe('sovereign');
    expect(contact.name).toBe('Kai');
  });

  it('should get a contact', () => {
    const contact = getContact('+440123456789', 'whatsapp');
    
    expect(contact).not.toBeNull();
    expect(contact!.name).toBe('Kai');
  });

  it('should check an allowed contact', () => {
    const result = checkContact('+440123456789', 'whatsapp');
    
    expect(result.allowed).toBe(true);
    expect(result.trust).toBe('sovereign');
    expect(result.name).toBe('Kai');
  });

  it('should deny unknown contact', () => {
    const result = checkContact('+440000000000', 'whatsapp');
    
    expect(result.allowed).toBe(false);
    expect(result.trust).toBeNull();
  });

  it('should list contacts', () => {
    addContact('+441234567890', 'whatsapp', 'trusted', 'Ayshe');
    
    const contacts = listContacts();
    expect(contacts.length).toBeGreaterThanOrEqual(2);
  });

  it('should filter by trust level', () => {
    const sovereign = listContacts(undefined, 'sovereign');
    expect(sovereign.every(c => c.trust === 'sovereign')).toBe(true);
  });

  it('should update trust level', () => {
    const updated = updateTrust('+441234567890', 'whatsapp', 'limited');
    expect(updated).toBe(true);
    
    const contact = getContact('+441234567890', 'whatsapp');
    expect(contact!.trust).toBe('limited');
  });

  it('should handle limited trust in check', () => {
    const result = checkContact('+441234567890', 'whatsapp');
    
    expect(result.allowed).toBe(true);
    expect(result.trust).toBe('limited');
    expect(result.reason).toContain('should not act');
  });

  it('should remove a contact', () => {
    const removed = removeContact('+441234567890', 'whatsapp');
    expect(removed).toBe(true);
    
    const contact = getContact('+441234567890', 'whatsapp');
    expect(contact).toBeNull();
  });
});
