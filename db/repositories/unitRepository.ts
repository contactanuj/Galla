import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';
import { newId } from '../../lib/id';

export interface Unit {
  id: string; name: string; abbreviation: string | null; tenant_id: string | null; created_at: number;
}

export async function getAllUnits(): Promise<Unit[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  return tid
    ? db.getAllAsync<Unit>('SELECT * FROM units WHERE tenant_id = ? ORDER BY name', [tid])
    : db.getAllAsync<Unit>('SELECT * FROM units ORDER BY name');
}

export async function createUnit(name: string, abbreviation: string): Promise<string> {
  const db = await getDatabase();
  const id = newId('un');
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  await db.runAsync('INSERT INTO units (id, name, abbreviation, tenant_id, created_at) VALUES (?,?,?,?,?)', [id, name, abbreviation || null, tid, now]);
  await addToSyncQueue('units', id, 'create', { id, name, abbreviation: abbreviation || null, tenant_id: tid, created_at: now });
  return id;
}

export async function deleteUnit(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM units WHERE id = ?', [id]);
  await addToSyncQueue('units', id, 'delete', { id });
}
