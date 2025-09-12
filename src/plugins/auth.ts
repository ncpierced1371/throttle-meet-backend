

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: { sub: string; role?: string; email?: string };
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate("requireAuth", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) throw new Error("missing");
      const token = auth.slice("Bearer ".length);
      const payload = await verifyToken(token, process.env.JWT_SECRET!);
      req.user = {
        sub: String(payload.sub),
        role: String(payload.role || "user"),
        email: String(payload.email || "")
      };
    } catch {
      reply.code(401).send({ message: "Invalid or missing token" });
    }
  });
}
