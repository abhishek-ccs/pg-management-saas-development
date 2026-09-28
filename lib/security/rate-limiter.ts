/**
 * In-memory sliding-window token bucket rate limiter for Next.js edge/serverless middleware.
 * Provides abuse protection against brute-force, scraping, and DoS attacks.
 */

interface RateLimitRecord {
  tokens: number
  lastRefill: number
}

interface RateLimitConfig {
  maxTokens: number
  refillRatePerSec: number
}

// Global cache across warm serverless invocations
const rateLimitCache = new Map<string, RateLimitRecord>()

// Pre-defined limits by route category
export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { maxTokens: 10, refillRatePerSec: 0.2 }, // 10 requests max, refills 1 token per 5s
  api: { maxTokens: 60, refillRatePerSec: 1 },    // 60 requests max, refills 1 token per 1s
  public: { maxTokens: 120, refillRatePerSec: 2 }, // 120 requests max, refills 2 tokens per 1s
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterSec?: number } {
  const now = Date.now()
  const record = rateLimitCache.get(key) ?? {
    tokens: config.maxTokens,
    lastRefill: now,
  }

  // Refill tokens based on elapsed time
  const elapsedSec = (now - record.lastRefill) / 1000
  const refilled = elapsedSec * config.refillRatePerSec
  record.tokens = Math.min(config.maxTokens, record.tokens + refilled)
  record.lastRefill = now

  if (record.tokens >= 1) {
    record.tokens -= 1
    rateLimitCache.set(key, record)
    return {
      allowed: true,
      remaining: Math.floor(record.tokens),
    }
  }

  // Rate limit exceeded
  const deficit = 1 - record.tokens
  const retryAfterSec = Math.ceil(deficit / config.refillRatePerSec)
  rateLimitCache.set(key, record)

  return {
    allowed: false,
    remaining: 0,
    retryAfterSec,
  }
}

// Clean up stale IP records periodically to prevent memory bloat
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitCache.entries()) {
      if (now - record.lastRefill > 300000) { // 5 minutes inactivity
        rateLimitCache.delete(key)
      }
    }
  }, 60000)
}
