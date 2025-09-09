import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { config } from '../config/config';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role?: string;
    [key: string]: any;
  };
  id?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token required', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = await verifyToken(token, String(config.jwt.secret));

    // TODO: Fetch user from database and attach to request
    req.user = {
      id: decoded.userId ? String(decoded.userId) : '',
      email: decoded.email ? String(decoded.email) : '',
      role: decoded.role ? String(decoded.role) : 'user'
    };

    if (req.user) {
      logger.info(`User authenticated: ${req.user.email}`, { 
        userId: req.user.id,
        requestId: req.id || 'unknown'
      });
    }

    next();
  } catch (error) {
    const err = error as Error;
  next(new AppError('Invalid or expired access token', 401));
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = await verifyToken(token, String(config.jwt.secret));
      req.user = {
        id: decoded.userId ? String(decoded.userId) : '',
        email: decoded.email ? String(decoded.email) : '',
        role: decoded.role ? String(decoded.role) : 'user'
      };
    } catch (error) {
      // Ignore auth errors for optional auth
      const err = error as Error;
      logger.warn('Optional auth failed', { error: err.message });
    }
  }
  
  next();
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};