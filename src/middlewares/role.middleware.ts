import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

/**
 * Role-based authorization middleware.
 * SUPER_ADMIN has global authority across all administrative and operational endpoints.
 */
export const requireRoles = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized. Please sign in.' });
      return;
    }

    // Super Admin has universal access across all role-protected endpoints
    if (req.user.role === Role.SUPER_ADMIN || roles.includes(req.user.role)) {
      return next();
    }

    res.status(403).json({
      success: false,
      message: `Forbidden. Your role (${req.user.role}) is not authorized for this resource. Required: ${roles.join(', ')}.`,
    });
  };
};
