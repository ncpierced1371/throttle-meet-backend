// ...existing code...
import type { FastifyPluginAsync } from "fastify";
import { memoryUsers } from "./auth.js";

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: app.requireAuth }, async (req) => {
    const userId = (req as any).userId as string;
    const store = memoryUsers.get(userId) || {};
    return {
      id: userId,
      displayName: store.displayName ?? null,
      primaryCar: store.primaryCar ?? null,
      avatarUrl: null,
      email: store.email ?? null,
    };
  });

  app.put("/me", { preHandler: app.requireAuth }, async (req) => {
    const userId = (req as any).userId as string;
    const body = req.body as Partial<{ displayName: string; primaryCar: string }>;

    const prev = memoryUsers.get(userId) || {};
    const next = {
      ...prev,
      displayName: body.displayName ?? prev.displayName,
      primaryCar: body.primaryCar ?? prev.primaryCar,
    };
    memoryUsers.set(userId, next);

    return {
      id: userId,
      displayName: next.displayName ?? null,
      primaryCar: next.primaryCar ?? null,
      avatarUrl: null,
      email: next.email ?? null,
    };
  });
};
