import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('server', () => {
  const TEST_DIR = join(tmpdir(), 'wasp-server-' + process.pid + '-' + Date.now());
  let app: any;
  
  beforeAll(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    process.env.WASP_DATA_DIR = TEST_DIR;
    
    // Initialize database
    const { initSchema, resetCache, reloadPaths } = await import('../db/client.js');
    resetCache();
    reloadPaths();
    initSchema();
    
    // Add a test contact
    const { addContact } = await import('../db/contacts.js');
    addContact('+441234567890', 'whatsapp', 'sovereign', 'Test User');
    
    // Create server
    const { createServer } = await import('./index.js');
    app = createServer();
  });

  afterAll(() => {
    delete process.env.WASP_DATA_DIR;
    delete process.env.WASP_API_TOKEN;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // Helper to make requests
  const request = (method: string, path: string, body?: any, headers?: Record<string, string>) => {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    return app.request(path, options);
  };

  describe('GET /health', () => {
    it('should return ok', async () => {
      const res = await request('GET', '/health');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('POST /check', () => {
    it('should allow known contact', async () => {
      const res = await request('POST', '/check', {
        identifier: '+441234567890',
        platform: 'whatsapp'
      });
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.allowed).toBe(true);
      expect(json.trust).toBe('sovereign');
    });

    it('should deny unknown contact', async () => {
      const res = await request('POST', '/check', {
        identifier: '+449999999999',
        platform: 'whatsapp'
      });
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.allowed).toBe(false);
      expect(json.reason).toBe('Contact not in whitelist');
    });

    it('should reject invalid JSON', async () => {
      const res = await app.request('/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json'
      });
      expect(res.status).toBe(400);
      
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON body');
    });

    it('should reject missing identifier', async () => {
      const res = await request('POST', '/check', {
        platform: 'whatsapp'
      });
      expect(res.status).toBe(400);
      
      const json = await res.json();
      expect(json.error).toBe('identifier is required');
    });

    it('should reject invalid platform', async () => {
      const res = await request('POST', '/check', {
        identifier: '+441234567890',
        platform: 'invalid'
      });
      expect(res.status).toBe(400);
      
      const json = await res.json();
      expect(json.error).toContain('Invalid platform');
    });

    it('should include rate limit headers', async () => {
      const res = await request('POST', '/check', {
        identifier: '+441234567890'
      });
      
      expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Admin endpoints (no token set)', () => {
    // When no WASP_API_TOKEN is set, localhost should be allowed
    
    it('GET /contacts should work from localhost', async () => {
      const res = await request('GET', '/contacts');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.contacts).toBeDefined();
      expect(json.contacts.length).toBeGreaterThan(0);
    });

    it('POST /contacts should add contact', async () => {
      const res = await request('POST', '/contacts', {
        identifier: '+447777777777',
        platform: 'whatsapp',
        trust: 'trusted',
        name: 'New Contact'
      });
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.contact.identifier).toBe('+447777777777');
      expect(json.contact.trust).toBe('trusted');
    });

    it('POST /contacts should reject invalid trust', async () => {
      const res = await request('POST', '/contacts', {
        identifier: '+448888888888',
        trust: 'invalid'
      });
      expect(res.status).toBe(400);
      
      const json = await res.json();
      expect(json.error).toContain('Invalid trust level');
    });

    it('DELETE /contacts/:id should remove contact', async () => {
      const res = await request('DELETE', '/contacts/%2B447777777777?platform=whatsapp');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.removed).toBe(true);
    });

    it('GET /audit should return entries', async () => {
      const res = await request('GET', '/audit?limit=10');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.entries).toBeDefined();
      expect(Array.isArray(json.entries)).toBe(true);
    });

    it('GET /audit should validate limit', async () => {
      const res = await request('GET', '/audit?limit=9999');
      expect(res.status).toBe(400);
      
      const json = await res.json();
      expect(json.error).toContain('limit must be between');
    });
  });

  describe('Admin endpoints (with token)', () => {
    beforeAll(() => {
      process.env.WASP_API_TOKEN = 'test-secret-token';
    });

    afterAll(() => {
      delete process.env.WASP_API_TOKEN;
    });

    it('should reject request without auth header', async () => {
      const res = await request('GET', '/contacts');
      expect(res.status).toBe(401);
      
      const json = await res.json();
      expect(json.error).toBe('Authorization header required');
    });

    it('should reject invalid token', async () => {
      const res = await request('GET', '/contacts', undefined, {
        'Authorization': 'Bearer wrong-token'
      });
      expect(res.status).toBe(401);
      
      const json = await res.json();
      expect(json.error).toBe('Invalid API token');
    });

    it('should accept valid Bearer token', async () => {
      const res = await request('GET', '/contacts', undefined, {
        'Authorization': 'Bearer test-secret-token'
      });
      expect(res.status).toBe(200);
    });

    it('should accept raw token', async () => {
      const res = await request('GET', '/contacts', undefined, {
        'Authorization': 'test-secret-token'
      });
      expect(res.status).toBe(200);
    });
  });
});
