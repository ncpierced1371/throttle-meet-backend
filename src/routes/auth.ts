import { Router } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authController } from '../controllers/authController';

const router = Router();

// Sign in with Apple
router.post('/apple', [
  body('identityToken').notEmpty().withMessage('Identity token is required'),
  body('authorizationCode').notEmpty().withMessage('Authorization code is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(authController.signInWithApple));

// Sign in with Facebook
router.post('/facebook', [
  body('accessToken').notEmpty().withMessage('Facebook access token is required'),
  validateRequest
], asyncHandler(authController.signInWithFacebook));

// Link Facebook account
router.post('/link-facebook', [
  body('accessToken').notEmpty().withMessage('Facebook access token is required'),
  validateRequest
], asyncHandler(authController.linkFacebook));

// Refresh token
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  validateRequest
], asyncHandler(authController.refreshToken));

// Sign out
router.post('/signout', asyncHandler(authController.signOut));

// Verify token (for app startup)
router.get('/verify', asyncHandler(authController.verifyToken));

export default router;