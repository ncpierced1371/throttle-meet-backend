<<<<<<< HEAD

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";

const createEventSchema = z.object({
  title: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().optional()
});

export async function eventRoutes(app: FastifyInstance) {
  app.get("/events", async () => {
    const events = await prisma.event.findMany({ orderBy: { startTime: "asc" } });
    return { events };
  });

  app.post("/events", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const event = await prisma.event.create({
      data: {
        title: data.title,
        type: "CAR_MEET", // Default, or get from body if you want to support it
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        organizerId: req.user!.sub
      }
    });
    return { event };
  });
}

