import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';

export interface Category { id: string; name: string; parent_id?: string; tenant_id?: string; created_at: number; }

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  return tid
    ? db.getAllAsync<Category>('SELECT * FROM categories WHERE tenant_id=? ORDER BY name', [tid])
    : db.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id=?', [id]);
  return row ?? null;
}

export async function getChildCategories(parentId: string | null): Promise<Category[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  if (parentId === null) {
    return tid
      ? db.getAllAsync<Category>('SELECT * FROM categories WHERE parent_id IS NULL AND tenant_id=? ORDER BY name', [tid])
      : db.getAllAsync<Category>('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name');
  }
  return tid
    ? db.getAllAsync<Category>('SELECT * FROM categories WHERE parent_id=? AND tenant_id=? ORDER BY name', [parentId, tid])
    : db.getAllAsync<Category>('SELECT * FROM categories WHERE parent_id=? ORDER BY name', [parentId]);
}

export async function createCategory(category: Omit<Category, 'created_at'>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = category.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync('INSERT INTO categories (id,name,parent_id,tenant_id,created_at) VALUES (?,?,?,?,?)', [category.id, category.name, category.parent_id ?? null, tid, now]);
  await addToSyncQueue('categories', category.id, 'create', { id: category.id, name: category.name, parent_id: category.parent_id ?? null, tenant_id: tid, created_at: now, updated_at: now });
}

export async function updateCategory(id: string, name: string, parentId?: string | null): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE categories SET name=?,parent_id=? WHERE id=?', [name, parentId ?? null, id]);
  const tid = getTenantId() ?? 't1';
  await addToSyncQueue('categories', id, 'update', { id, name, parent_id: parentId ?? null, tenant_id: tid, updated_at: now });
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM categories WHERE id=?', [id]);
  await addToSyncQueue('categories', id, 'delete', { id });
}

export async function getCategoryPath(id: string): Promise<string[]> {
  const db = await getDatabase();
  const path: string[] = [];
  let currentId: string | null = id;
  while (currentId) {
    const row: { id: string; name: string; parent_id: string | null } | null =
      await db.getFirstAsync('SELECT id,name,parent_id FROM categories WHERE id=?', [currentId]);
    if (!row) break;
    path.unshift(row.name);
    currentId = row.parent_id ?? null;
  }
  return path;
}
