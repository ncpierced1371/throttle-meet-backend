import { query } from './database';

export async function findUserByAppleId(appleUserId: string) {
  const result = await query('SELECT * FROM throttlemeet.users WHERE apple_user_id = $1', [appleUserId]);
  return result.rows[0] || null;
}

export async function createUser({ email, display_name, auth_provider, apple_user_id, first_name, last_name }: {
  email: string;
  display_name: string;
  auth_provider: string;
  apple_user_id: string;
  first_name?: string;
  last_name?: string;
}) {
  const result = await query(
    `INSERT INTO throttlemeet.users (
      email, display_name, auth_provider, apple_user_id, first_name, last_name, email_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, true)
    RETURNING *`,
    [email, display_name, auth_provider, apple_user_id, first_name, last_name]
  );
  return result.rows[0];
}

export async function updateUser(id: string, fields: Record<string, any>) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return null;
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const sql = `UPDATE throttlemeet.users SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
  const result = await query(sql, [...values, id]);
  return result.rows[0];
}
