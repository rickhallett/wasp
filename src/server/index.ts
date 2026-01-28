import { serve as nodeServe } from '@hono/node-server';
import { Hono } from 'hono';
import { getAuditLog, logDecision } from '../db/audit.js';
import { addContact, checkContact, listContacts, removeContact } from '../db/contacts.js';
import { checkRateLimit, type RateLimitConfig } from '../ratelimit.js';
import type { Platform, TrustLevel } from '../types.js';

// Detect runtime
const isBun = typeof globalThis.Bun !== 'undefined';

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 checks per minute per IP
};

const VALID_PLATFORMS = [
  'whatsapp',
  'telegram',
  'email',
  'discord',
  'slack',
  'signal',
  'webchat',
] as const;

/**
 * Extract client IP from request headers.
 * Handles X-Forwarded-For which may contain multiple IPs (client, proxy1, proxy2, ...)
 */
function getClientIp(c: any): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For can be "client, proxy1, proxy2" - we want the first (client)
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return c.req.header('x-real-ip') || 'unknown';
}

/**
 * Validate platform value against allowed platforms.
 */
function isValidPlatform(platform: string): platform is Platform {
  return VALID_PLATFORMS.includes(platform as any);
}

/**
 * Authentication middleware for admin endpoints.
 * Checks for Bearer token or API key in Authorization header.
 *
 * Token is configured via WASP_API_TOKEN environment variable.
 * If not set, admin endpoints are localhost-only.
 */
function authMiddleware(c: any, next: () => Promise<void>): Promise<Response | void> | Response {
  const apiToken = process.env.WASP_API_TOKEN;
  const clientIp = getClientIp(c);

  // If no token configured, only allow localhost
  if (!apiToken) {
    const isLocalhost =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === 'localhost' ||
      clientIp === 'unknown'; // Direct connection, no proxy

    if (!isLocalhost) {
      return c.json(
        {
          error:
            'Admin endpoints require authentication. Set WASP_API_TOKEN or access from localhost.',
        },
        401
      );
    }
    return next();
  }

  // Check Authorization header
  const authHeader = c.req.header('authorization');
  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  // Support both "Bearer <token>" and raw token
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (token !== apiToken) {
    return c.json({ error: 'Invalid API token' }, 401);
  }

  return next();
}

export function createServer() {
  const app = new Hono();

  // Health check (no auth required)
  app.get('/health', (c) => {
    return c.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Check if a contact is allowed (no auth - this is the main integration point)
  app.post('/check', async (c) => {
    const clientIp = getClientIp(c);
    const rateLimit = checkRateLimit(`check:${clientIp}`, RATE_LIMIT_CONFIG);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.maxRequests));
    c.header('X-RateLimit-Remaining', String(rateLimit.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetMs / 1000)));

    if (!rateLimit.allowed) {
      return c.json(
        {
          error: 'Rate limit exceeded',
          retryAfterMs: rateLimit.resetMs,
        },
        429
      );
    }

    let body: { identifier?: string; platform?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { identifier, platform = 'whatsapp' } = body;

    if (!identifier) {
      return c.json({ error: 'identifier is required' }, 400);
    }

    if (!isValidPlatform(platform)) {
      return c.json(
        { error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` },
        400
      );
    }

    const result = checkContact(identifier, platform);

    // Log the decision
    const decision = !result.allowed ? 'deny' : result.trust === 'limited' ? 'limited' : 'allow';
    logDecision(identifier, platform, decision, result.reason);

    return c.json(result);
  });

  // ============================================
  // Admin endpoints (require authentication)
  // ============================================

  // List contacts
  app.get('/contacts', authMiddleware, (c) => {
    const platform = c.req.query('platform');
    const trust = c.req.query('trust');

    // Validate query params if provided
    if (platform && !isValidPlatform(platform)) {
      return c.json({ error: `Invalid platform filter` }, 400);
    }

    const contacts = listContacts(
      platform as Platform | undefined,
      trust as TrustLevel | undefined
    );
    return c.json({ contacts });
  });

  // Add contact
  app.post('/contacts', authMiddleware, async (c) => {
    let body: {
      identifier?: string;
      platform?: string;
      trust?: string;
      name?: string;
      notes?: string;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { identifier, platform = 'whatsapp', trust = 'trusted', name, notes } = body;

    if (!identifier) {
      return c.json({ error: 'identifier is required' }, 400);
    }

    if (!isValidPlatform(platform)) {
      return c.json({ error: `Invalid platform` }, 400);
    }

    const validTrusts = ['sovereign', 'trusted', 'limited'];
    if (!validTrusts.includes(trust)) {
      return c.json(
        { error: `Invalid trust level. Must be one of: ${validTrusts.join(', ')}` },
        400
      );
    }

    const contact = addContact(identifier, platform, trust as TrustLevel, name, notes);
    return c.json({ contact });
  });

  // Remove contact
  app.delete('/contacts/:identifier', authMiddleware, (c) => {
    const rawId = c.req.param('identifier');
    if (!rawId) {
      return c.json({ error: 'Missing identifier' }, 400);
    }
    const identifier = decodeURIComponent(rawId);
    const platform = c.req.query('platform') || 'whatsapp';

    if (!isValidPlatform(platform)) {
      return c.json({ error: `Invalid platform` }, 400);
    }

    const removed = removeContact(identifier, platform);
    return c.json({ removed });
  });

  // Audit log
  app.get('/audit', authMiddleware, (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    if (Number.isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: 'limit must be between 1 and 1000' }, 400);
    }

    const decision = c.req.query('decision') as 'allow' | 'deny' | 'limited' | undefined;
    if (decision && !['allow', 'deny', 'limited'].includes(decision)) {
      return c.json({ error: 'Invalid decision filter' }, 400);
    }

    const entries = getAuditLog({ limit, decision });
    return c.json({ entries });
  });

  return app;
}

export function startServer(port: number = 3847): void {
  const app = createServer();

  const hasToken = !!process.env.WASP_API_TOKEN;

  console.log(`wasp server listening on http://localhost:${port}`);
  console.log('');
  console.log('Public endpoints:');
  console.log('  POST /check         - Check if contact is allowed');
  console.log('  GET  /health        - Health check');
  console.log('');
  console.log('Admin endpoints (protected):');
  console.log('  GET  /contacts      - List contacts');
  console.log('  POST /contacts      - Add contact');
  console.log('  DELETE /contacts/:id - Remove contact');
  console.log('  GET  /audit         - View audit log');
  console.log('');
  if (hasToken) {
    console.log('Authentication: API token required (WASP_API_TOKEN is set)');
  } else {
    console.log('Authentication: Localhost-only (set WASP_API_TOKEN for remote access)');
  }

  if (isBun) {
    // Bun runtime
    Bun.serve({
      port,
      fetch: app.fetch,
    });
  } else {
    // Node.js runtime
    nodeServe({
      port,
      fetch: app.fetch,
    });
  }
}
