import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Prevent logging in production or log concise error
  if (process.env.NODE_ENV !== 'production') {
    console.error('Unhandled Server Error:', err);
  } else {
    console.error(`[ERROR] ${req.method} ${req.url}: ${err.message || 'Unknown error'}`);
  }

  // Handle Prisma Known Errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      res.status(409).json({
        success: false,
        error: 'DUPLICATE_ENTRY',
        message: `A record with this ${target} already exists in the system.`,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested medical record or resource was not found.',
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Database query constraints failed. Please verify input data.',
    });
    return;
  }

  // Handle JSON Syntax Errors (Malicious or broken JSON payloads)
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Invalid JSON payload structure received.',
    });
    return;
  }

  // Handle JWT Auth Errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Your authorization token is invalid. Please sign in again.',
    });
    return;
  }
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Your login session has expired. Please sign in again to continue.',
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `API endpoint '${req.method} ${req.originalUrl}' does not exist on BookMyDoctorBD Backend.`,
  });
};
