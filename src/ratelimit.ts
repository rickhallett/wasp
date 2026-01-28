/**
 * Rate Limiter
 * 
 * Sliding window rate limiting for wasp check requests.
 * Prevents abuse and DoS attempts.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store: Map<string, RateLimitEntry> = new Map();

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100      // 100 requests per minute
};

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetMs: config.windowMs
    };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    const resetMs = config.windowMs - (now - entry.windowStart);
    return {
      allowed: false,
      remaining: 0,
      resetMs
    };
  }

  // Increment counter
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetMs: config.windowMs - (now - entry.windowStart)
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

export function clearExpiredEntries(maxAgeMs: number = 5 * 60 * 1000): number {
  const now = Date.now();
  let cleared = 0;
  
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > maxAgeMs) {
      store.delete(key);
      cleared++;
    }
  }
  
  return cleared;
}

// Periodic cleanup (every 5 minutes)
setInterval(() => {
  clearExpiredEntries();
}, 5 * 60 * 1000);

export { DEFAULT_CONFIG };
