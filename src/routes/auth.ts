<<<<<<< HEAD
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
=======
import { FastifyPluginAsync } from "fastify";
import { signAccessToken, signRefreshToken, verifyToken } from "../lib/jwt.js";

// Super-light in-memory “user directory” just for local dev.
// Key = userId, Value = basic profile bits to surface in /me.
export const memoryUsers = new Map<string, { email?: string; displayName?: string; primaryCar?: string }>();

function mkUserId(prefix: string, unique: string) {
  return `${prefix}_${unique}`; // e.g., apple_ABC123 or fb_999
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/refresh", async (req, reply) => {
    const body = req.body as { refreshToken?: string };
    if (!body?.refreshToken) return reply.code(400).send({ error: "Missing refreshToken" });
    try {
      const payload = await verifyToken(body.refreshToken, process.env.JWT_SECRET ?? "dev-access-secret");
      if (payload.typ !== "refresh") return reply.code(401).send({ error: "Invalid token type" });
      const userId = String(payload.sub);
      if (!userId) return reply.code(401).send({ error: "No sub" });
      const token = await signAccessToken({ sub: userId }, process.env.JWT_SECRET ?? "dev-access-secret");
      const refreshToken = await signRefreshToken({ sub: userId }, process.env.JWT_SECRET ?? "dev-access-secret");
      return { token, refreshToken };
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }
  });

  app.post("/auth/apple", async (req, reply) => {
    const body = req.body as { identityToken?: string };
    if (!body?.identityToken) return reply.code(400).send({ error: "Missing identityToken" });

    // DEV: parse the JWT body best-effort to get a stable subject/email.
    // NOTE: not validated against Apple keys in dev.
    const parts = body.identityToken.split(".");
    let sub = "apple_local";
    let email: string | undefined;
    try {
      if (parts.length >= 2) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        sub = decoded.sub ?? sub;
        email = decoded.email;
      }
    } catch {}
    const userId = mkUserId("apple", sub);

    if (!memoryUsers.has(userId)) {
      memoryUsers.set(userId, { email, displayName: undefined, primaryCar: undefined });
    }

    const token = await signAccessToken({ sub: userId, email }, process.env.JWT_SECRET ?? "dev-access-secret");
    const refreshToken = await signRefreshToken({ sub: userId, email }, process.env.JWT_SECRET ?? "dev-access-secret");
    return { token, refreshToken };
  });

  app.post("/auth/facebook", async (req, reply) => {
    const body = req.body as { accessToken?: string };
    if (!body?.accessToken) return reply.code(400).send({ error: "Missing accessToken" });

    // DEV: derive a “sub” from the token (no FB Graph validation yet).
    const sub = body.accessToken.slice(0, 16);
    const userId = mkUserId("fb", sub);

    if (!memoryUsers.has(userId)) {
      memoryUsers.set(userId, { email: undefined, displayName: undefined, primaryCar: undefined });
    }

    const token = await signAccessToken({ sub: userId }, process.env.JWT_SECRET ?? "dev-access-secret");
    const refreshToken = await signRefreshToken({ sub: userId }, process.env.JWT_SECRET ?? "dev-access-secret");
    return { token, refreshToken };
  });
};
>>>>>>> 6008042 (feat: serverless-ready Fastify backend, Vercel integration, and workflow cleanup)
