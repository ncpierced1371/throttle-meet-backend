export type UserRole = 'admin' | 'moderator' | 'user';

export function checkRole(user: { role: UserRole }, required: UserRole[]): boolean {
  return required.includes(user.role);
}
