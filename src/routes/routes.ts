<<<<<<< HEAD
import { Router } from 'express';
const router = Router();

// Placeholder for routes endpoints
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: { routes: [] }
  });
});

export default router;
=======
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { z } from "zod";

const createRouteSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["SCENIC", "PERFORMANCE", "TRACK_ACCESS", "MOUNTAIN", "COASTAL"]),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).optional(),
  distanceKm: z.number().optional(),
  estDurationMin: z.number().optional()
});

const waypointSchema = z.object({
  order: z.number().int().min(0),
  latitude: z.number(),
  longitude: z.number(),
  note: z.string().optional()
});

export async function routeRoutes(app: FastifyInstance) {
  app.get("/routes", async () => {
    const routes = await prisma.route.findMany({
      include: { waypoints: true },
      orderBy: { createdAt: "desc" }
    });
    return { routes };
  });

  app.post("/routes", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const route = await prisma.route.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        difficulty: data.difficulty ?? "BEGINNER",
        distanceKm: data.distanceKm,
        estDurationMin: data.estDurationMin,
        authorId: req.user!.sub
      }
    });
    return { route };
  });

  app.put("/routes/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as any;
    const parsed = createRouteSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing || existing.authorId !== req.user!.sub) return reply.code(403).send({ error: "Forbidden" });
  const updateData: any = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.description) updateData.description = parsed.data.description;
  if (parsed.data.category) updateData.category = parsed.data.category;
  if (parsed.data.difficulty) updateData.difficulty = parsed.data.difficulty;
  if (parsed.data.distanceKm) updateData.distanceKm = parsed.data.distanceKm;
  if (parsed.data.estDurationMin) updateData.estDurationMin = parsed.data.estDurationMin;
  const route = await prisma.route.update({ where: { id }, data: updateData });
    return { route };
  });

  app.delete("/routes/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as any;
    const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing || existing.authorId !== req.user!.sub) return reply.code(403).send({ error: "Forbidden" });
    await prisma.route.delete({ where: { id } });
    return { ok: true };
  });

  // Waypoints
  app.get("/routes/:id/waypoints", async (req) => {
    const { id } = req.params as any;
  const waypoints = await prisma.routeWaypoint.findMany({ where: { routeId: id }, orderBy: { order: "asc" } });
    return { waypoints };
  });

  app.post("/routes/:id/waypoints", { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = req.params as any;
    const items = z.array(waypointSchema).safeParse(req.body);
    if (!items.success) return reply.code(400).send({ error: items.error.flatten() });
    const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing || existing.authorId !== req.user!.sub) return reply.code(403).send({ error: "Forbidden" });
    // Replace all waypoints for simplicity
    await prisma.routeWaypoint.deleteMany({ where: { routeId: id } });
    await prisma.$transaction(items.data.map((w) =>
      prisma.routeWaypoint.create({ data: { routeId: id, ...w } })
    ));
    const waypoints = await prisma.routeWaypoint.findMany({ where: { routeId: id }, orderBy: { order: "asc" } });
    return { waypoints };
  });
}
>>>>>>> 6008042 (feat: serverless-ready Fastify backend, Vercel integration, and workflow cleanup)
