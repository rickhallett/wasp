import { Hono } from 'hono';
import { checkContact, listContacts, addContact, removeContact } from '../db/contacts.js';
import { logDecision, getAuditLog } from '../db/audit.js';
import type { Platform, TrustLevel } from '../types.js';

export function createServer() {
  const app = new Hono();

  // Health check
  app.get('/health', (c) => {
    return c.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Check if a contact is allowed
  app.post('/check', async (c) => {
    const body = await c.req.json();
    const { identifier, platform = 'whatsapp' } = body;

    if (!identifier) {
      return c.json({ error: 'identifier is required' }, 400);
    }

    const result = checkContact(identifier, platform as Platform);
    
    // Log the decision
    const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
    logDecision(identifier, platform as Platform, decision, result.reason);

    return c.json(result);
  });

  // List contacts (admin)
  app.get('/contacts', (c) => {
    const platform = c.req.query('platform') as Platform | undefined;
    const trust = c.req.query('trust') as TrustLevel | undefined;
    
    const contacts = listContacts(platform, trust);
    return c.json({ contacts });
  });

  // Add contact (admin)
  app.post('/contacts', async (c) => {
    const body = await c.req.json();
    const { identifier, platform = 'whatsapp', trust = 'trusted', name, notes } = body;

    if (!identifier) {
      return c.json({ error: 'identifier is required' }, 400);
    }

    const contact = addContact(identifier, platform as Platform, trust as TrustLevel, name, notes);
    return c.json({ contact });
  });

  // Remove contact (admin)
  app.delete('/contacts/:identifier', (c) => {
    const identifier = c.req.param('identifier');
    const platform = (c.req.query('platform') || 'whatsapp') as Platform;
    
    const removed = removeContact(identifier, platform);
    return c.json({ removed });
  });

  // Audit log (admin)
  app.get('/audit', (c) => {
    const limit = parseInt(c.req.query('limit') || '100');
    const decision = c.req.query('decision') as 'allow' | 'deny' | 'limited' | undefined;
    
    const entries = getAuditLog({ limit, decision });
    return c.json({ entries });
  });

  return app;
}

export function startServer(port: number = 3847): void {
  const app = createServer();
  
  console.log(`wasp server listening on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log('  POST /check         - Check if contact is allowed');
  console.log('  GET  /contacts      - List contacts');
  console.log('  POST /contacts      - Add contact');
  console.log('  DELETE /contacts/:id - Remove contact');
  console.log('  GET  /audit         - View audit log');
  console.log('  GET  /health        - Health check');
  
  Bun.serve({
    port,
    fetch: app.fetch,
  });
}
