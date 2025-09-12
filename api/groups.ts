import { prisma } from '../src/lib/db';
import { verifyToken } from '../src/lib/jwt';
import { getCache, setCache } from '../src/lib/redis';
import { FastifyRequest, FastifyReply } from 'fastify';
// For CORS, use Fastify's built-in CORS plugin or a custom handler if needed
// import cors from '../../src/middleware/cors';
import { validate } from '../src/middleware/validation';

// GET /api/groups
export async function listGroups(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const offset = (Number(page) - 1) * Number(limit);
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: Number(limit)
  });
  reply.send({ success: true, data: groups });
}

// POST /api/groups
export async function createGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  // Replace with JWT verification logic
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user: any = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user || typeof user !== 'object' || typeof (user as any).id !== 'string') return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { name, description } = req.body as { name: string; description?: string };
  await validate(req, reply, () => {}); // Placeholder for validation
  // Generate a slug from the name (simple, lowercase, hyphens)
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const group = await prisma.group.create({
    data: {
      name,
      description,
      slug,
      owner: {
        connect: { id: (user as any).id }
      }
    }
  });
  reply.send({ success: true, data: group });
}

// GET /api/groups/:id
export async function getGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const { id } = req.params as { id: string };
  const cacheKey = `group:id:${id}`;
  let group = await getCache(cacheKey);
  if (!group) {
    group = await prisma.group.findUnique({
      where: { id }
    });
    await setCache(cacheKey, group, 60);
  }
  reply.send({ success: true, data: group });
}

// POST /api/groups/:id/join
export async function joinGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user: any = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user || typeof user !== 'object' || typeof (user as any).id !== 'string') return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { id } = req.params as { id: string };
  try {
    await prisma.groupMember.create({
      data: {
        groupId: id,
        userId: (user as any).id
      }
    });
    reply.send({ success: true });
  } catch (error: any) {
    // Handle unique constraint violation (already a member)
    if (error.code === 'P2002') {
      reply.send({ success: true, message: 'Already a member' });
    } else {
      reply.status(500).send({ success: false, error: error.message });
    }
  }
}

// POST /api/groups/:id/leave
export async function leaveGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user: any = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user || typeof user !== 'object' || typeof (user as any).id !== 'string') return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { id } = req.params as { id: string };
  await prisma.groupMember.deleteMany({
    where: {
      groupId: id,
      userId: (user as any).id
    }
  });
  reply.send({ success: true });
}
