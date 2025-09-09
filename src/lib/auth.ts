
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRY = '7d';

export interface AuthPayload {
  userId: string;
  email: string;
  role?: string;
}

export const generateToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

export const verifyToken = (token: string): AuthPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};
