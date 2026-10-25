import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of ipStore.entries()) {
    if (value.resetTime <= now) {
      ipStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export interface RateLimitOptions {
  windowMs: number;       // Window size in milliseconds
  maxRequests: number;    // Maximum allowed requests in window
  message?: string;       // Custom error message
  keyPrefix?: string;     // Prefix for key partition
}

export const createRateLimiter = (options: RateLimitOptions) => {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests from this IP address. Please slow down and try again later.',
    keyPrefix = 'global',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Get client IP behind proxies (e.g. Vercel, Cloudflare, Nginx)
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress || '127.0.0.1'
    );

    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    const record = ipStore.get(key);

    if (!record || record.resetTime <= now) {
      // First request in this window
      ipStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

      res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `${message} Retry after ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
    next();
  };
};

// Global limiter: 300 requests per 15 minutes
export const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'global',
  message: 'Global rate limit reached.',
});

// Strict Auth limiter: 25 requests per 15 minutes to thwart brute-force password / OTP attacks
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. For your security, this IP is temporarily throttled.',
});

// AI & autocomplete limiter: 120 requests per 15 minutes to prevent prompt injection / scraping abuse
export const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'ai',
  message: 'AI diagnosis query limit reached. Please wait before submitting more queries.',
});

