import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';

export interface StoreProfile {
  id: string; tenant_id: string | null; name: string | null; address: string | null;
  phone: string | null; email: string | null; tax_id: string | null;
  logo_uri: string | null; logo_url: string | null; footer_note: string | null;
  currency: string; created_at: number; updated_at: number;
}

export async function getStoreProfile(): Promise<StoreProfile | null> {
  const db = await getDatabase();
  const tid = getTenantId();
  const row = await (tid
    ? db.getFirstAsync<StoreProfile>('SELECT * FROM store_profiles WHERE tenant_id = ? LIMIT 1', [tid])
    : db.getFirstAsync<StoreProfile>('SELECT * FROM store_profiles LIMIT 1'));
  return row ?? null;
}

export async function upsertStoreProfile(data: Partial<StoreProfile>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  const existing = await getStoreProfile();
  const id = existing?.id ?? `sp-${tid}`;
  const currency = data.currency ?? existing?.currency ?? 'INR';
  if (existing) {
    await db.runAsync(
      `UPDATE store_profiles SET name=?, address=?, phone=?, email=?, tax_id=?, logo_uri=?, logo_url=?, footer_note=?, currency=?, updated_at=? WHERE id=?`,
      [data.name ?? null, data.address ?? null, data.phone ?? null, data.email ?? null, data.tax_id ?? null,
       data.logo_uri ?? existing.logo_uri ?? null, data.logo_url ?? existing.logo_url ?? null, data.footer_note ?? null, currency, now, id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO store_profiles (id, tenant_id, name, address, phone, email, tax_id, logo_uri, logo_url, footer_note, currency, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, tid, data.name ?? null, data.address ?? null, data.phone ?? null, data.email ?? null, data.tax_id ?? null,
       data.logo_uri ?? null, data.logo_url ?? null, data.footer_note ?? null, currency, now, now]
    );
  }
  const saved = await getStoreProfile();
  if (saved) {
    await addToSyncQueue('store_profiles', id, existing ? 'update' : 'create', {
      id, tenant_id: tid, name: saved.name, address: saved.address, phone: saved.phone, email: saved.email,
      tax_id: saved.tax_id, logo_url: saved.logo_url, footer_note: saved.footer_note, currency: saved.currency,
      created_at: saved.created_at, updated_at: now,
    });
  }
}
