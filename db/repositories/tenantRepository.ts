import { getDatabase } from '../schema';
import { newId } from '../../lib/id';
import { supabase, supabaseEnabled } from '../../lib/supabase';

export interface Tenant {
  id: string;
  name: string;
  plan: 'standard' | 'professional' | 'enterprise';
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface TenantWithStats extends Tenant {
  user_count: number;
  product_count: number;
}

/**
 * Platform/superuser data syncs DIRECTLY and immediately to Supabase — never via
 * the offline queue (which is for store transactions). Throws on failure so the
 * admin UI can surface it. No-ops only when Supabase is disabled or there is no
 * authenticated session.
 */
async function syncTenant(op: 'upsert' | 'delete', t: { id: string; name?: string; plan?: string; is_active?: number }): Promise<void> {
  if (!supabaseEnabled) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  if (op === 'delete') {
    const { error } = await supabase.from('tenants').delete().eq('id', t.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('tenants').upsert(
      { id: t.id, name: t.name, plan: t.plan, is_active: !!t.is_active },
      { onConflict: 'id' }
    );
    if (error) throw new Error(error.message);
  }
}

export async function getAllTenants(): Promise<TenantWithStats[]> {
  const db = await getDatabase();
  return db.getAllAsync<TenantWithStats>(`
    SELECT t.*,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count,
      (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id) as product_count
    FROM tenants t ORDER BY t.name
  `);
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Tenant>('SELECT * FROM tenants WHERE id = ?', [id]);
  return row ?? null;
}

export async function createTenant(name: string, plan: Tenant['plan'] = 'standard'): Promise<string> {
  const db = await getDatabase();
  const id = newId('t');
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    'INSERT INTO tenants (id, name, plan, is_active, created_at, updated_at) VALUES (?,?,?,1,?,?)',
    [id, name, plan, now, now]
  );
  await syncTenant('upsert', { id, name, plan, is_active: 1 });
  return id;
}

export async function updateTenant(id: string, data: Partial<Pick<Tenant, 'name' | 'plan' | 'is_active'>>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `UPDATE tenants SET name=COALESCE(?,name), plan=COALESCE(?,plan), is_active=COALESCE(?,is_active), updated_at=? WHERE id=?`,
    [data.name ?? null, data.plan ?? null, data.is_active ?? null, now, id]
  );
  const updated = await getTenantById(id);
  if (updated) await syncTenant('upsert', { id, name: updated.name, plan: updated.plan, is_active: updated.is_active });
}

export async function deleteTenant(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  // Soft-delete — deactivating preserves all data and relationships
  await db.runAsync('UPDATE tenants SET is_active = 0, updated_at = ? WHERE id = ?', [now, id]);
  await db.runAsync('UPDATE users SET is_active = 0, updated_at = ? WHERE tenant_id = ?', [now, id]);
  await syncTenant('upsert', { id, is_active: 0 });
}

export async function getTenantUserCount(tenantId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND is_active = 1', [tenantId]
  );
  return row?.count ?? 0;
}
