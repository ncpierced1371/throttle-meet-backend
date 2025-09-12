// api/index.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../src/app.js";

// Reuse a single Fastify instance across invocations for speed
const app = buildApp();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle Vercel root and favicon requests explicitly
  if (req.url === "/" || req.url === "/api" || req.url === "/api/") {
    res.status(200).json({ status: "ok", message: "ThrottleMeet backend is running" });
    return;
  }
  if (req.url === "/favicon.ico" || req.url === "/api/favicon.ico") {
    res.status(204).end();
    return;
  }
  if (req.url === "/favicon.png" || req.url === "/api/favicon.png") {
    res.status(204).end();
    return;
  }
  // Ensure Fastify is ready
  await app.ready();
  // Let Fastify handle the Node req/res
  app.server.emit("request", req, res);
}
