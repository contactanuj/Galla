import { getDatabase } from '../../db/schema';

export interface SyncQueueItem {
  id: string; entity_type: string; entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: string; status: string; retry_count: number; created_at: number;
}

/** Give up on a queue item after this many failed push attempts. */
export const MAX_SYNC_RETRIES = 8;

export async function addToSyncQueue(entityType: string, entityId: string, operation: 'create' | 'update' | 'delete', payload: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  const id = `sq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, status, retry_count, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', [id, entityType, entityId, operation, JSON.stringify(payload), 'pending', now]);
}

/**
 * Enqueue a relative stock change (negative for a sale, positive for a
 * restock). Relative deltas compose across devices - concurrent sales no longer
 * collide or silently overwrite each other the way absolute stock writes did.
 */
export async function addStockMovementToQueue(kind: 'product' | 'variant', id: string, delta: number): Promise<void> {
  await addToSyncQueue('stock_movement', id, 'update', { kind, id, delta });
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueItem>("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC");
}

export async function markSyncItemStatus(id: string, status: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE sync_queue SET status = ? WHERE id = ?', [status, id]);
}

/**
 * Record a failed push attempt. Transient failures stay `pending` so the next
 * sync tick retries them; only after MAX_SYNC_RETRIES do we park the item as
 * `failed` (surfaced for a human) instead of abandoning it on the first error.
 */
export async function recordSyncFailure(item: SyncQueueItem): Promise<void> {
  const db = await getDatabase();
  const attempts = (item.retry_count ?? 0) + 1;
  const status = attempts >= MAX_SYNC_RETRIES ? 'failed' : 'pending';
  await db.runAsync('UPDATE sync_queue SET retry_count = ?, status = ? WHERE id = ?', [attempts, status, item.id]);
}

export async function createSyncConflict(entityType: string, entityId: string, localPayload: string, serverVersion?: string): Promise<void> {
  const db = await getDatabase();
  const id = `sc-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('INSERT INTO sync_conflicts (id, entity_type, entity_id, local_payload, server_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, entityType, entityId, localPayload, serverVersion ?? null, 'unresolved', now]);
}

export async function getSyncConflicts(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueItem>("SELECT * FROM sync_conflicts WHERE status = 'unresolved' ORDER BY created_at DESC");
}

export async function resolveSyncConflict(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE sync_conflicts SET status = 'resolved' WHERE id = ?", [id]);
}
