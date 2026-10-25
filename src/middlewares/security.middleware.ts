import { Request, Response, NextFunction } from 'express';

// Recursively sanitize strings in object
function sanitizeValue(val: any): any {
  if (typeof val === 'string') {
    // 1. Remove null bytes
    let clean = val.replace(/\0/g, '');
    // 2. Strip obvious dangerous executable script tags while preserving normal medical notes & text
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/javascript:[^"']*/gi, '');
    return clean;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (val !== null && typeof val === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      sanitizedObj[key] = sanitizeValue(val[key]);
    }
    return sanitizedObj;
  }
  return val;
}

export const securityHeadersMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  // Prevent clickjacking & iframe hijacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
};

export const requestSanitizerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Method restriction
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    if (!allowedMethods.includes(req.method)) {
      res.status(405).json({
        success: false,
        message: `HTTP method ${req.method} is not allowed.`,
      });
      return;
    }

    // Sanitize body if present
    if (req.body && typeof req.body === 'object') {
      try {
        req.body = sanitizeValue(req.body);
      } catch {
        // ignore
      }
    }

    // In Express 5, req.query is a getter; mutate individual keys in-place
    if (req.query && typeof req.query === 'object') {
      try {
        for (const k of Object.keys(req.query)) {
          (req.query as any)[k] = sanitizeValue((req.query as any)[k]);
        }
      } catch {
        // ignore
      }
    }

    next();
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: 'Malformatted request payload detected.',
    });
  }
};

