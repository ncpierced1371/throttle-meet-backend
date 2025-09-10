import { query } from '../../src/lib/db';
import { verifyJWT } from '../../src/lib/jwt';
import { getRedis, setRedis } from '../../src/lib/redis';
import { FastifyRequest, FastifyReply } from 'fastify';
import cors from '../../src/middleware/cors';
import validation from '../../src/middleware/validation';

// GET /api/groups
export async function listGroups(req: FastifyRequest, reply: FastifyReply) {
  await cors(req, reply);
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const result = await query('SELECT * FROM groups ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
  reply.send({ success: true, data: result.rows });
}

// POST /api/groups
export async function createGroup(req: FastifyRequest, reply: FastifyReply) {
  await cors(req, reply);
  const user = await verifyJWT(req, reply);
  if (!user) return;
  const { name, description } = req.body;
  await validation(req.body, ['name']);
  const result = await query('INSERT INTO groups (name, description, creator_id) VALUES ($1, $2, $3) RETURNING *', [name, description, user.id]);
  reply.send({ success: true, data: result.rows[0] });
}

// GET /api/groups/:id
export async function getGroup(req: FastifyRequest, reply: FastifyReply) {
  await cors(req, reply);
  const { id } = req.params;
  const cacheKey = `group:id:${id}`;
  let group = await getRedis(cacheKey);
  if (!group) {
    const result = await query('SELECT * FROM groups WHERE id = $1', [id]);
    group = result.rows[0];
    await setRedis(cacheKey, group, 60);
  }
  reply.send({ success: true, data: group });
}

// POST /api/groups/:id/join
export async function joinGroup(req: FastifyRequest, reply: FastifyReply) {
  await cors(req, reply);
  const user = await verifyJWT(req, reply);
  if (!user) return;
  const { id } = req.params;
  await query('INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.id]);
  reply.send({ success: true });
}

// POST /api/groups/:id/leave
export async function leaveGroup(req: FastifyRequest, reply: FastifyReply) {
  await cors(req, reply);
  const user = await verifyJWT(req, reply);
  if (!user) return;
  const { id } = req.params;
  await query('DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2', [id, user.id]);
  reply.send({ success: true });
}
