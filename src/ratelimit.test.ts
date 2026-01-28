import { describe, it, expect, beforeEach } from 'bun:test';
import { checkRateLimit, resetRateLimit } from './ratelimit.js';

describe('ratelimit', () => {
  beforeEach(() => {
    resetRateLimit('test-key');
  });

  it('should allow requests under limit', () => {
    const result = checkRateLimit('test-key', { windowMs: 1000, maxRequests: 5 });
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should track multiple requests', () => {
    const config = { windowMs: 1000, maxRequests: 3 };
    
    checkRateLimit('test-key', config);
    checkRateLimit('test-key', config);
    const third = checkRateLimit('test-key', config);
    
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('should block when limit exceeded', () => {
    const config = { windowMs: 1000, maxRequests: 2 };
    
    checkRateLimit('test-key', config);
    checkRateLimit('test-key', config);
    const blocked = checkRateLimit('test-key', config);
    
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('should track different keys separately', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    
    checkRateLimit('key-a', config);
    const keyB = checkRateLimit('key-b', config);
    
    expect(keyB.allowed).toBe(true);
  });

  it('should reset after window expires', async () => {
    const config = { windowMs: 50, maxRequests: 1 };
    
    checkRateLimit('test-key', config);
    const blocked = checkRateLimit('test-key', config);
    expect(blocked.allowed).toBe(false);
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    
    const afterExpiry = checkRateLimit('test-key', config);
    expect(afterExpiry.allowed).toBe(true);
  });
});
