import { Request } from 'express';

// Extend Express Request type to include user property
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      role?: string;
      [key: string]: any;
    };
  }
}
