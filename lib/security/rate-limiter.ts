/**
 * Hybrid Rate Limiter for Next.js Edge / Serverless Proxy.
 *
 * Architecture:
 * - Shared Store: Uses Upstash Redis REST API when UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN are configured. Provides atomic distributed protection
 *   across multi-region and serverless function instances.
 * - Local Fallback: If credentials are not configured or if Upstash is unreachable/slow,
 *   fails safely to an in-memory token bucket limiter without throwing, dropping requests,
 *   or disabling abuse protection.
 */

export interface RateLimitRecord {
  tokens: number
  lastRefill: number
}

export interface RateLimitConfig {
  maxTokens: number
  refillRatePerSec: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec?: number
  store: 'redis' | 'memory'
}

// Global cache across warm serverless invocations
const rateLimitCache = new Map<string, RateLimitRecord>()

// Pre-defined limits by route category
export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { maxTokens: 10, refillRatePerSec: 0.2 }, // 10 requests max, refills 1 token per 5s
  api: { maxTokens: 60, refillRatePerSec: 1 },    // 60 requests max, refills 1 token per 1s
  public: { maxTokens: 120, refillRatePerSec: 2 }, // 120 requests max, refills 2 tokens per 1s
  otp_send: { maxTokens: 5, refillRatePerSec: 0.05 }, // 5 sends max, refills 1 token per 20s
  otp_verify: { maxTokens: 10, refillRatePerSec: 0.1 }, // 10 verifications max, refills 1 token per 10s
  password_reset: { maxTokens: 5, refillRatePerSec: 0.05 }, // 5 reset requests max, refills 1 token per 20s
}

/**
 * In-memory token bucket rate limiter.
 * Always available synchronously and as a reliable fail-safe fallback.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterSec?: number; store: 'memory' } {
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
      store: 'memory',
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
    store: 'memory',
  }
}

/**
 * Shared-store distributed rate limiter with safe in-memory fallback.
 * Uses atomic Upstash Redis REST pipeline commands if configured.
 */
export async function checkSharedRateLimit(
  key: string,
  config: RateLimitConfig,
  overrides?: {
    url?: string
    token?: string
    fetchFn?: typeof fetch
  }
): Promise<RateLimitResult> {
  const url = overrides?.url ?? process.env.UPSTASH_REDIS_REST_URL
  const token = overrides?.token ?? process.env.UPSTASH_REDIS_REST_TOKEN
  const fetchImpl = overrides?.fetchFn ?? fetch

  // If Upstash Redis is not configured, safely fall back to in-memory token bucket
  if (!url || !token) {
    return checkRateLimit(key, config)
  }

  try {
    const rawUrl = url.trim()
    const endpoint = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl.replace(/\/+$/, '')
      : `https://${rawUrl.replace(/\/+$/, '')}`

    const windowSec = Math.max(1, Math.ceil(config.maxTokens / config.refillRatePerSec))
    const now = Date.now()
    const currentWindow = Math.floor(now / (windowSec * 1000))
    const redisKey = `staynest:ratelimit:${key}:${currentWindow}`

    // Upstash Redis REST pipeline with atomic INCR and TTL
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1500)

    const response = await fetchImpl(`${endpoint}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, windowSec * 2, 'NX'],
      ]),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn(`[RateLimiter] Upstash Redis returned HTTP ${response.status}. Falling back to memory limiter.`)
      return checkRateLimit(key, config)
    }

    const data = (await response.json()) as Array<{ result?: number; error?: string }>
    if (!Array.isArray(data) || typeof data[0]?.result !== 'number') {
      console.warn('[RateLimiter] Unexpected Upstash response format. Falling back to memory limiter.')
      return checkRateLimit(key, config)
    }

    const currentCount = data[0].result
    if (currentCount > config.maxTokens) {
      const elapsedInWindow = Math.floor((now % (windowSec * 1000)) / 1000)
      const retryAfterSec = Math.max(1, windowSec - elapsedInWindow)
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec,
        store: 'redis',
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.maxTokens - currentCount),
      store: 'redis',
    }
  } catch (err: any) {
    // Fail-safe: Network partition, timeout, or DNS failure must never crash or block the application
    console.warn(`[RateLimiter] Distributed store check failed (${err?.message || 'timeout'}). Gracefully falling back to memory limiter.`)
    return checkRateLimit(key, config)
  }
}

// Clean up stale IP records periodically to prevent memory bloat
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitCache.entries()) {
      if (now - record.lastRefill > 300000) { // 5 minutes inactivity
        rateLimitCache.delete(key)
      }
    }
  }, 60000)
  if (typeof (cleanupTimer as any)?.unref === 'function') {
    ;(cleanupTimer as any).unref()
  }
}
