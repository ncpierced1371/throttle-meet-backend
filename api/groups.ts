import { query } from '../../src/lib/database';
import { verifyToken } from '../../src/lib/jwt';
import { getCache, setCache } from '../../src/lib/redis';
import { FastifyRequest, FastifyReply } from 'fastify';
// For CORS, use Fastify's built-in CORS plugin or a custom handler if needed
// import cors from '../../src/middleware/cors';
import { validate } from '../../src/middleware/validation';

// GET /api/groups
export async function listGroups(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const offset = (Number(page) - 1) * Number(limit);
  const result = await query('SELECT * FROM groups ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
  reply.send({ success: true, data: result.rows });
}

// POST /api/groups
export async function createGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  // Replace with JWT verification logic
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user) return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { name, description } = req.body as { name: string; description?: string };
  await validate(req, reply, () => {}); // Placeholder for validation
  const result = await query('INSERT INTO groups (name, description, creator_id) VALUES ($1, $2, $3) RETURNING *', [name, description, user.id]);
  reply.send({ success: true, data: result.rows[0] });
}

// GET /api/groups/:id
export async function getGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const { id } = req.params as { id: string };
  const cacheKey = `group:id:${id}`;
  let group = await getCache(cacheKey);
  if (!group) {
    const result = await query('SELECT * FROM groups WHERE id = $1', [id]);
    group = result.rows[0];
    await setCache(cacheKey, group, 60);
  }
  reply.send({ success: true, data: group });
}

// POST /api/groups/:id/join
export async function joinGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user) return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { id } = req.params as { id: string };
  await query('INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.id]);
  reply.send({ success: true });
}

// POST /api/groups/:id/leave
export async function leaveGroup(req: FastifyRequest, reply: FastifyReply) {
  // If using Fastify CORS plugin, this is handled globally
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let user = null;
  if (token) {
    try {
      user = await verifyToken(token, process.env.JWT_SECRET!);
    } catch (e) {
      reply.status(401).send({ success: false, error: 'Invalid token' });
      return;
    }
  }
  if (!user) return reply.status(401).send({ success: false, error: 'Unauthorized' });
  const { id } = req.params as { id: string };
  await query('DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2', [id, user.id]);
  reply.send({ success: true });
}
