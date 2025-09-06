import { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));
}
