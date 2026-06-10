import { getDatabase } from '../schema';
import type { UserRole } from '../../constants/roles';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  tenant_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<User>('SELECT * FROM users WHERE email = ?', [email]);
  return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);
  return row ?? null;
}

export async function getAllUsers(tenantId?: string | null): Promise<User[]> {
  const db = await getDatabase();
  return tenantId
    ? db.getAllAsync<User>('SELECT * FROM users WHERE tenant_id = ? ORDER BY name', [tenantId])
    : db.getAllAsync<User>('SELECT * FROM users ORDER BY role, name');
}

export async function createUser(data: Omit<User, 'created_at' | 'updated_at'>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    'INSERT INTO users (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [data.id, data.email, data.password_hash, data.name, data.role, data.tenant_id ?? null, data.is_active ?? 1, now, now]
  );
}

export async function updateUser(id: string, data: Partial<Pick<User, 'name' | 'email' | 'password_hash' | 'role' | 'tenant_id' | 'is_active'>>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email),
     password_hash=COALESCE(?,password_hash), role=COALESCE(?,role),
     tenant_id=COALESCE(?,tenant_id), is_active=COALESCE(?,is_active), updated_at=? WHERE id=?`,
    [data.name ?? null, data.email ?? null, data.password_hash ?? null, data.role ?? null,
     data.tenant_id ?? null, data.is_active ?? null, now, id]
  );
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?', [now, id]);
}
