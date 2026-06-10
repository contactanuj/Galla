import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseEnabled } from '../../lib/supabase';
import { getTenantId, currentUserIsSystemAdmin, currentUserIsAdmin } from '../../lib/tenantContext';
import { getDatabase } from '../../db/schema';
import { getPendingSyncItems, markSyncItemStatus, recordSyncFailure, createSyncConflict } from './syncQueue';
import { updateOrderSyncStatus } from '../../db/repositories/orderRepository';

const LAST_PULLED_PREFIX = 'supabase_last_pulled_at';

// Tables synced from Supabase → local, with the column used for incremental pulls.
// Order matters for FK dependencies (parents before children).
const PULL_TABLES: { table: string; ts: 'updated_at' | 'created_at' }[] = [
  { table: 'tenants',           ts: 'updated_at' },
  { table: 'categories',        ts: 'updated_at' },
  { table: 'units',             ts: 'created_at' },
  { table: 'products',          ts: 'updated_at' },
  { table: 'product_variants',  ts: 'updated_at' },
  { table: 'product_barcodes',  ts: 'created_at' },
  { table: 'vendors',           ts: 'updated_at' },
  { table: 'product_vendors',   ts: 'created_at' },
  { table: 'layout_nodes',      ts: 'updated_at' },
  { table: 'product_locations', ts: 'created_at' },
  { table: 'customers',         ts: 'updated_at' },
  { table: 'customer_payments', ts: 'created_at' },
  { table: 'store_profiles',    ts: 'updated_at' },
  { table: 'purchase_orders',   ts: 'updated_at' },
  { table: 'orders',            ts: 'updated_at' },
  { table: 'order_items',       ts: 'created_at' },
];

// Integer columns that map to Postgres BOOLEAN.
const BOOLEAN_FIELDS = new Set(['is_active', 'is_preferred', 'resolved']);

// ─── Timestamp helpers ────────────────────────────────────────────────────────

function unixToISO(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

function isoToUnix(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor(new Date(iso).getTime() / 1000);
}

// Convert Supabase row (ISO dates, booleans, JSONB) → SQLite row (Unix ts, 0/1, TEXT)
function toSQLiteRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if ((key.endsWith('_at')) && typeof out[key] === 'string') {
      out[key] = isoToUnix(out[key] as string);
    }
    if (typeof out[key] === 'boolean') out[key] = out[key] ? 1 : 0;
    if (out[key] !== null && typeof out[key] === 'object') {
      out[key] = JSON.stringify(out[key]); // JSONB → TEXT
    }
  }
  return out;
}

// Convert SQLite row (Unix ts, 0/1) → Supabase row (ISO dates, booleans)
function toSupabaseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (key.endsWith('_at') && typeof out[key] === 'number' && (out[key] as number) > 0) {
      out[key] = unixToISO(out[key] as number);
    }
    if (BOOLEAN_FIELDS.has(key) && typeof out[key] === 'number') {
      out[key] = out[key] === 1;
    }
  }
  return out;
}

// ─── Last-pulled timestamp ────────────────────────────────────────────────────

// Per-business cursor: each tenant tracks its own last-pulled timestamp, so a
// shared device can hold several businesses and each fully syncs its own data
// (system_admin, who has no tenant, uses a dedicated 'admin' bucket).
function lastPulledKey(): string {
  return `${LAST_PULLED_PREFIX}:${getTenantId() ?? 'admin'}`;
}

async function getLastPulledAt(): Promise<string> {
  return (await AsyncStorage.getItem(lastPulledKey())) ?? '1970-01-01T00:00:00Z';
}

async function setLastPulledAt(ts: string): Promise<void> {
  await AsyncStorage.setItem(lastPulledKey(), ts);
}

// ─── Local column introspection (cached) ─────────────────────────────────────

const localColsCache: Record<string, Set<string>> = {};

async function getLocalColumns(table: string): Promise<Set<string>> {
  if (localColsCache[table]) return localColsCache[table];
  const db = await getDatabase();
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const cols = new Set(info.map((c) => c.name));
  localColsCache[table] = cols;
  return cols;
}

// ─── UPSERT a pulled row into local SQLite (strips columns the local table lacks) ─

async function upsertLocalRow(table: string, row: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  const localCols = await getLocalColumns(table);
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (localCols.has(key)) filtered[key] = row[key];
  }
  // Pulled rows already exist on the server, so they are considered synced locally.
  if (table === 'orders' && localCols.has('sync_status')) filtered.sync_status = 'synced';

  const cols = Object.keys(filtered);
  if (cols.length === 0) return;
  const placeholders = cols.map(() => '?').join(',');
  const updateClause = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClause}`;
  await db.runAsync(sql, Object.values(filtered) as any[]);
}

// ─── PULL: Supabase → local SQLite ───────────────────────────────────────────

// Subtract a small overlap from the cursor so rows written with the same
// timestamp as the last row we saw are not skipped (re-pulls are idempotent).
const CURSOR_OVERLAP_SECONDS = 2;

async function runPullOnce(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;

  const tenantId = getTenantId();
  const isSysAdmin = currentUserIsSystemAdmin();
  const canSeeCost = currentUserIsAdmin();
  const lastPulled = await getLastPulledAt();
  // Drive the cursor off the SERVER timestamps we actually observe, not the
  // device clock - clock skew between device and server no longer drops rows.
  let maxSeen = lastPulled;
  let total = 0;

  for (const { table, ts } of PULL_TABLES) {
    // `tenants` has no tenant_id column and is platform-wide - only system_admin syncs it.
    if (table === 'tenants' && !isSysAdmin) continue;
    // Cashiers never receive cost_price into their local cache (defence in depth
    // on top of the server-side column protection).
    const cols = table === 'products' && !canSeeCost
      ? 'id,name,selling_price,stock_quantity,reorder_level,unit_of_measurement,category_id,image_url,units,tenant_id,version,created_at,updated_at'
      : '*';
    // `cols` is dynamic, so opt out of supabase-js's literal column-type
    // inference (which would otherwise type the result as a ParserError).
    let q: any = supabase.from(table).select(cols).gt(ts, lastPulled);
    if (tenantId && !isSysAdmin) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error || !data?.length) continue;
    for (const row of data as Record<string, unknown>[]) {
      const r = row as Record<string, unknown>;
      const rowTs = r[ts];
      if (typeof rowTs === 'string' && rowTs > maxSeen) maxSeen = rowTs;
      try {
        await upsertLocalRow(table, toSQLiteRow(r));
        total++;
      } catch { /* skip rows that don't fit the local schema */ }
    }
  }

  if (maxSeen > lastPulled) {
    const cursor = new Date(new Date(maxSeen).getTime() - CURSOR_OVERLAP_SECONDS * 1000).toISOString();
    await setLastPulledAt(cursor);
  }
  return total;
}

let pulling = false;
let pullAgain = false;
export async function pullLatest(): Promise<number> {
  if (!supabaseEnabled) return 0;
  if (pulling) { pullAgain = true; return 0; } // serialize overlapping pulls
  pulling = true;
  try {
    let total = 0;
    do { pullAgain = false; total += await runPullOnce(); } while (pullAgain);
    return total;
  } finally { pulling = false; }
}

// ─── PUSH: local sync_queue → Supabase ───────────────────────────────────────

async function runPushOnce(): Promise<{ synced: number; failed: number; conflicts: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { synced: 0, failed: 0, conflicts: 0 };

  const result = { synced: 0, failed: 0, conflicts: 0 };
  const pending = await getPendingSyncItems();

  for (const item of pending) {
    const table = item.entity_type;
    try {
      // Relative stock change - applied server-side via RPC so concurrent
      // multi-device sales/restocks compose instead of clobbering each other.
      if (table === 'stock_movement') {
        const mv = JSON.parse(item.payload) as { kind: 'product' | 'variant'; id: string; delta: number };
        const { data, error } = await supabase.rpc('apply_stock_delta', { p_kind: mv.kind, p_id: mv.id, p_delta: mv.delta });
        // `data === false` ⇒ the product/variant hasn't synced yet; retry later
        // rather than dropping the decrement.
        if (error || data === false) { await recordSyncFailure(item); result.failed++; continue; }
        await markSyncItemStatus(item.id, 'synced');
        result.synced++;
        continue;
      }

      const payload = toSupabaseRow(JSON.parse(item.payload));

      if (item.operation === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', item.entity_id);
        if (error) { await recordSyncFailure(item); result.failed++; continue; }
        await markSyncItemStatus(item.id, 'synced');
        result.synced++;
        continue;
      }

      // Optimistic Concurrency Control for versioned product edits.
      if (item.operation === 'update' && table === 'products' && payload.version != null) {
        const newVersion = Number(payload.version);
        const base = newVersion - 1;
        const { data, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', item.entity_id)
          .eq('version', base)
          .select('id');
        if (error) { await recordSyncFailure(item); result.failed++; continue; }
        if (!data || data.length === 0) {
          const { data: srv } = await supabase.from('products').select('*').eq('id', item.entity_id).maybeSingle();
          if (srv) {
            // Server advanced past our base version → real conflict (terminal).
            await createSyncConflict(table, item.entity_id, item.payload, JSON.stringify(srv));
            await markSyncItemStatus(item.id, 'failed');
            result.conflicts++;
            continue;
          }
          // Row absent server-side - insert fresh.
          const { error: insErr } = await supabase.from('products').insert(payload);
          if (insErr) { await recordSyncFailure(item); result.failed++; continue; }
        }
      } else if (item.operation === 'update') {
        // Patch existing rows with `.update()` (never upsert). A partial payload
        // must never INSERT an incomplete row and trip a NOT NULL constraint.
        const { error } = await supabase.from(table).update(payload).eq('id', item.entity_id);
        if (error) { await recordSyncFailure(item); result.failed++; continue; }
      } else {
        // Create: full row, idempotent on the client-generated id.
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
        if (error) { await recordSyncFailure(item); result.failed++; continue; }
      }

      await markSyncItemStatus(item.id, 'synced');
      result.synced++;

      // Mark the local order as synced so the 30-day purge can reclaim it later.
      if (table === 'orders') {
        try { await updateOrderSyncStatus(item.entity_id, 'synced'); } catch { /* ignore */ }
      }
    } catch {
      await recordSyncFailure(item);
      result.failed++;
    }
  }

  return result;
}

let pushing = false;
let pushAgain = false;
export async function processSyncQueue(): Promise<{ synced: number; failed: number; conflicts: number }> {
  if (!supabaseEnabled) return { synced: 0, failed: 0, conflicts: 0 };
  if (pushing) { pushAgain = true; return { synced: 0, failed: 0, conflicts: 0 }; } // serialize
  pushing = true;
  try {
    let result = { synced: 0, failed: 0, conflicts: 0 };
    do {
      pushAgain = false;
      const r = await runPushOnce();
      result = { synced: result.synced + r.synced, failed: r.failed, conflicts: result.conflicts + r.conflicts };
    } while (pushAgain);
    return result;
  } finally { pushing = false; }
}

// ─── Subscribe to real-time changes (multi-device) ───────────────────────────

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

// Every synced domain table, so a change on any device propagates live.
const REALTIME_TABLES = [
  'products', 'product_variants', 'categories', 'vendors', 'product_vendors',
  'product_barcodes', 'orders', 'order_items', 'purchase_orders', 'customers',
  'units', 'store_profiles', 'layout_nodes', 'product_locations',
];

export function subscribeRealtime(onUpdate: () => void): () => void {
  if (!supabaseEnabled) return () => {};
  const tenantId = getTenantId();
  const filter = tenantId ? `tenant_id=eq.${tenantId}` : undefined;

  // Coalesce bursts of change events into a single sync pass (a bulk update on
  // another device would otherwise trigger one full push+pull per row).
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onUpdate(); }, 600);
  };

  let channel = supabase.channel('tenant-changes');
  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter },
      () => debounced()
    );
  }
  realtimeChannel = channel.subscribe();

  return () => {
    if (timer) { clearTimeout(timer); timer = null; }
    realtimeChannel?.unsubscribe();
    realtimeChannel = null;
  };
}
