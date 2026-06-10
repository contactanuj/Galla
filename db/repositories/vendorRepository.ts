import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';
import { newId } from '../../lib/id';

export interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tenant_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface VendorWithProductCount extends Vendor {
  product_count: number;
}

export interface ProductVendor extends Vendor {
  is_preferred: number;
}

function vendorPayload(v: Vendor) {
  return {
    id: v.id, name: v.name, contact_person: v.contact_person ?? null, email: v.email ?? null,
    phone: v.phone ?? null, address: v.address ?? null, notes: v.notes ?? null,
    tenant_id: v.tenant_id, is_active: v.is_active, created_at: v.created_at, updated_at: v.updated_at,
  };
}

export async function getAllVendors(): Promise<VendorWithProductCount[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const query = tid
    ? `SELECT v.*, COUNT(pv.product_id) as product_count FROM vendors v
       LEFT JOIN product_vendors pv ON pv.vendor_id = v.id
       WHERE v.tenant_id = ? AND v.is_active = 1
       GROUP BY v.id ORDER BY v.name`
    : `SELECT v.*, COUNT(pv.product_id) as product_count FROM vendors v
       LEFT JOIN product_vendors pv ON pv.vendor_id = v.id
       WHERE v.is_active = 1
       GROUP BY v.id ORDER BY v.name`;
  return tid
    ? db.getAllAsync<VendorWithProductCount>(query, [tid])
    : db.getAllAsync<VendorWithProductCount>(query);
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Vendor>('SELECT * FROM vendors WHERE id = ?', [id]);
  return row ?? null;
}

export async function searchVendors(query: string): Promise<Vendor[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const like = `%${query}%`;
  return tid
    ? db.getAllAsync<Vendor>(
        'SELECT * FROM vendors WHERE tenant_id = ? AND is_active = 1 AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name',
        [tid, like, like, like, like]
      )
    : db.getAllAsync<Vendor>(
        'SELECT * FROM vendors WHERE is_active = 1 AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name',
        [like, like, like, like]
      );
}

export async function createVendor(data: Omit<Vendor, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const db = await getDatabase();
  const id = newId('v');
  const now = Math.floor(Date.now() / 1000);
  const tid = data.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT INTO vendors (id, name, contact_person, email, phone, address, notes, tenant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [id, data.name, data.contact_person ?? null, data.email ?? null, data.phone ?? null,
     data.address ?? null, data.notes ?? null, tid, data.is_active ?? 1, now, now]
  );
  await addToSyncQueue('vendors', id, 'create', vendorPayload({ ...data, id, tenant_id: tid, is_active: data.is_active ?? 1, created_at: now, updated_at: now } as Vendor));
  return id;
}

export async function updateVendor(id: string, data: Partial<Omit<Vendor, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `UPDATE vendors SET name=COALESCE(?,name), contact_person=COALESCE(?,contact_person),
     email=COALESCE(?,email), phone=COALESCE(?,phone), address=COALESCE(?,address),
     notes=COALESCE(?,notes), is_active=COALESCE(?,is_active), updated_at=? WHERE id=?`,
    [data.name ?? null, data.contact_person ?? null, data.email ?? null, data.phone ?? null,
     data.address ?? null, data.notes ?? null, data.is_active ?? null, now, id]
  );
  const updated = await getVendorById(id);
  if (updated) await addToSyncQueue('vendors', id, 'update', vendorPayload(updated));
}

export async function deleteVendor(id: string): Promise<void> {
  const db = await getDatabase();
  // Soft-delete so PO history is preserved
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE vendors SET is_active = 0, updated_at = ? WHERE id = ?', [now, id]);
  const updated = await getVendorById(id);
  if (updated) await addToSyncQueue('vendors', id, 'update', vendorPayload(updated));
}

// --- Product ↔ Vendor links ---

export async function getProductVendors(productId: string): Promise<ProductVendor[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVendor>(
    `SELECT v.*, pv.is_preferred FROM vendors v
     JOIN product_vendors pv ON pv.vendor_id = v.id
     WHERE pv.product_id = ? AND v.is_active = 1
     ORDER BY pv.is_preferred DESC, v.name`,
    [productId]
  );
}

export async function getVendorProducts(vendorId: string) {
  const db = await getDatabase();
  return db.getAllAsync<{ product_id: string; product_name: string; is_preferred: number }>(
    `SELECT p.id as product_id, p.name as product_name, pv.is_preferred
     FROM products p JOIN product_vendors pv ON pv.product_id = p.id
     WHERE pv.vendor_id = ? ORDER BY pv.is_preferred DESC, p.name`,
    [vendorId]
  );
}

export async function linkProductVendor(productId: string, vendorId: string, isPreferred = false): Promise<void> {
  const db = await getDatabase();
  const id = newId('pv');
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT OR REPLACE INTO product_vendors (id, product_id, vendor_id, is_preferred, tenant_id, created_at) VALUES (?,?,?,?,?,?)',
    [id, productId, vendorId, isPreferred ? 1 : 0, tid, now]
  );
  await addToSyncQueue('product_vendors', id, 'create', { id, product_id: productId, vendor_id: vendorId, is_preferred: isPreferred ? 1 : 0, tenant_id: tid, created_at: now });
}

export async function unlinkProductVendor(productId: string, vendorId: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM product_vendors WHERE product_id = ? AND vendor_id = ?', [productId, vendorId]);
  await db.runAsync('DELETE FROM product_vendors WHERE product_id = ? AND vendor_id = ?', [productId, vendorId]);
  if (existing) await addToSyncQueue('product_vendors', existing.id, 'delete', { id: existing.id });
}

export async function setPreferredVendor(productId: string, vendorId: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  // Clear preferred flag for all vendors on this product, then set for chosen vendor
  await db.runAsync('UPDATE product_vendors SET is_preferred = 0 WHERE product_id = ?', [productId]);
  const id = newId('pv');
  await db.runAsync(
    'INSERT OR REPLACE INTO product_vendors (id, product_id, vendor_id, is_preferred, tenant_id, created_at) VALUES (?,?,?,1,?,?)',
    [id, productId, vendorId, tid, now]
  );
  await addToSyncQueue('product_vendors', id, 'create', { id, product_id: productId, vendor_id: vendorId, is_preferred: 1, tenant_id: tid, created_at: now });
}

/** Called when a PO is received: links every product in the PO to the PO's vendor */
export async function markPOItemsReceived(productIds: string[], vendorId: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  for (const productId of productIds) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM product_vendors WHERE product_id = ? AND vendor_id = ?',
      [productId, vendorId]
    );
    if (!existing) {
      const id = newId('pv');
      await db.runAsync(
        'INSERT INTO product_vendors (id, product_id, vendor_id, is_preferred, tenant_id, created_at) VALUES (?,?,?,0,?,?)',
        [id, productId, vendorId, tid, now]
      );
      await addToSyncQueue('product_vendors', id, 'create', { id, product_id: productId, vendor_id: vendorId, is_preferred: 0, tenant_id: tid, created_at: now });
    }
  }
}
