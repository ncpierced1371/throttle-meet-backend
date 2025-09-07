// src/app.ts
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";

import { authPlugin } from "./plugins/auth";
import { profileRoutes } from "./routes/profiles.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js"; // Ensure named export
import { eventRoutes } from "./routes/events.js"; // Ensure named export
import { routeRoutes } from "./routes/routes.js"; // Ensure named export
import { mediaRoutes } from "./routes/media.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(cors, {
    origin: [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/, /^https?:\/\/.*throttlemeet\.com$/],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  app.register(authPlugin);

  // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(profileRoutes);
  app.register(eventRoutes);
  app.register(routeRoutes);
  app.register(mediaRoutes);

  // Handle favicon requests to prevent 504 timeouts
  app.get('/favicon.ico', async (req, reply) => {
    reply.code(204).send();
  });

  return app;
}
