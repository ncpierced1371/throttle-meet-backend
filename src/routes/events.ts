<<<<<<< HEAD
import { Router } from 'express';
import { body, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Get events
router.get('/', [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('rallyType').optional().isIn(['trackDay', 'carMeet', 'cruise', 'autoX', 'dragRace', 'socialShare']),
  query('latitude').optional().isFloat(),
  query('longitude').optional().isFloat(),
  query('radius').optional().isFloat({ min: 0 }),
  validateRequest
], asyncHandler(async (req, res) => {
  // TODO: Implement events retrieval with filtering
  res.json({
    success: true,
    data: {
      events: [],
      pagination: {
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
        total: 0
      }
    }
  });
}));

// Create event
router.post('/', [
  body('title').notEmpty().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('rallyType').isIn(['trackDay', 'carMeet', 'cruise', 'autoX', 'dragRace', 'socialShare']),
  body('startDate').isISO8601().toDate(),
  body('endDate').optional().isISO8601().toDate(),
  body('venueName').optional().trim().isLength({ max: 200 }),
  body('venueAddress').optional().trim().isLength({ max: 500 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  validateRequest
], asyncHandler(async (req, res) => {
  // TODO: Implement event creation
  res.status(201).json({
    success: true,
    message: 'Event created successfully',
    data: {
      eventId: 'mock-event-id'
    }
  });
}));

export default router;
=======
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
>>>>>>> 6008042 (feat: serverless-ready Fastify backend, Vercel integration, and workflow cleanup)
