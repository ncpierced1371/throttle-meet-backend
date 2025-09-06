// api/index.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../src/app.js";

// Reuse a single Fastify instance across invocations for speed
const app = buildApp();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure Fastify is ready
  await app.ready();

  // Let Fastify handle the Node req/res
  app.server.emit("request", req, res);
}
