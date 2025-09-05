import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

class AuthController {
  async signInWithApple(req: Request, res: Response): Promise<void> {
    const { identityToken, authorizationCode, email, displayName } = req.body;

    try {
      // TODO: Verify Apple identity token
      // For now, create a mock user response
      const userId = 'apple_' + Math.random().toString(36).substring(7);
      
      const user = {
        id: userId,
        email: email || `${userId}@apple.local`,
        displayName: displayName || 'Apple User',
        authProvider: 'apple',
        isNewUser: true
      };

      // Generate JWT tokens - Fix: Separate payload and options
      const accessToken = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          role: 'user'
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      logger.info(`Apple sign-in successful for user: ${user.email}`);

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          user,
          accessToken,
          refreshToken,
          expiresIn: config.jwt.expiresIn
        }
      });
    } catch (error) {
      logger.error('Apple sign-in failed', { error });
      throw new AppError('Apple authentication failed', 400);
    }
  }

  async signInWithFacebook(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.body;

    try {
      // TODO: Verify Facebook access token with Facebook Graph API
      // For now, create a mock user response
      const userId = 'facebook_' + Math.random().toString(36).substring(7);
      
      const user = {
        id: userId,
        email: `${userId}@facebook.local`,
        displayName: 'Facebook User',
        authProvider: 'facebook',
        isNewUser: true
      };

      // Generate JWT tokens - Fix: Separate payload and options
      const jwtToken = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          role: 'user'
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      logger.info(`Facebook sign-in successful for user: ${user.email}`);

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          user,
          accessToken: jwtToken,
          refreshToken,
          expiresIn: config.jwt.expiresIn
        }
      });
    } catch (error) {
      logger.error('Facebook sign-in failed', { error });
      throw new AppError('Facebook authentication failed', 400);
    }
  }

  async linkFacebook(req: Request, res: Response): Promise<void> {
    const { accessToken } = req.body;

    try {
      // TODO: Link Facebook account to existing user
      
      res.status(200).json({
        success: true,
        message: 'Facebook account linked successfully'
      });
    } catch (error) {
      logger.error('Facebook linking failed', { error });
      throw new AppError('Failed to link Facebook account', 400);
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.secret) as any;

      // Generate new access token - Fix: Separate payload and options
      const accessToken = jwt.sign(
        { 
          userId: decoded.userId,
          role: 'user'
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken,
          expiresIn: config.jwt.expiresIn
        }
      });
    } catch (error) {
      logger.error('Token refresh failed', { error });
      throw new AppError('Invalid refresh token', 401);
    }
  }

  async signOut(req: Request, res: Response): Promise<void> {
    // TODO: Implement token blacklisting in Redis
    
    res.status(200).json({
      success: true,
      message: 'Signed out successfully'
    });
  }

  async verifyToken(req: Request, res: Response): Promise<void> {
    // This endpoint uses the auth middleware, so if we get here, token is valid
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        user: (req as any).user
      }
    });
  }
}

export const authController = new AuthController();