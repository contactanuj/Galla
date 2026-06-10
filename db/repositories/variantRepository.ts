import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue, addStockMovementToQueue } from '../../services/sync/syncQueue';

export interface ProductVariant {
  id: string; product_id: string; name: string; attributes: string | null;
  cost_price: number | null; selling_price: number;
  stock_quantity: number; reorder_level: number;
  barcode: string | null; tenant_id: string | null; is_active: number;
  created_at: number; updated_at: number;
}

function payload(v: ProductVariant) {
  return {
    id: v.id, product_id: v.product_id, name: v.name, attributes: v.attributes ?? null,
    cost_price: v.cost_price ?? null, selling_price: v.selling_price,
    stock_quantity: v.stock_quantity, reorder_level: v.reorder_level,
    barcode: v.barcode ?? null, tenant_id: v.tenant_id, is_active: v.is_active,
    created_at: v.created_at, updated_at: v.updated_at,
  };
}

export async function getVariantsByProduct(productId: string): Promise<ProductVariant[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductVariant>('SELECT * FROM product_variants WHERE product_id=? AND is_active=1 ORDER BY name', [productId]);
}

export async function getVariantById(id: string): Promise<ProductVariant | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProductVariant>('SELECT * FROM product_variants WHERE id=?', [id]);
  return row ?? null;
}

export async function getVariantByBarcode(barcode: string): Promise<(ProductVariant & { product_name: string }) | null> {
  const db = await getDatabase();
  const tid = getTenantId();
  const sql = `SELECT v.*, p.name as product_name FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.barcode = ? AND v.is_active = 1 ${tid ? 'AND v.tenant_id = ?' : ''} LIMIT 1`;
  const row = await (tid
    ? db.getFirstAsync<ProductVariant & { product_name: string }>(sql, [barcode, tid])
    : db.getFirstAsync<ProductVariant & { product_name: string }>(sql, [barcode]));
  return row ?? null;
}

export async function createVariant(data: Omit<ProductVariant, 'created_at' | 'updated_at' | 'is_active' | 'tenant_id'> & { tenant_id?: string | null }): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = data.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT INTO product_variants (id,product_id,name,attributes,cost_price,selling_price,stock_quantity,reorder_level,barcode,tenant_id,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)',
    [data.id, data.product_id, data.name, data.attributes ?? null, data.cost_price ?? null, data.selling_price, data.stock_quantity, data.reorder_level, data.barcode ?? null, tid, now, now]
  );
  await addToSyncQueue('product_variants', data.id, 'create', payload({ ...data, tenant_id: tid, is_active: 1, created_at: now, updated_at: now } as ProductVariant));
}

export async function updateVariant(id: string, data: Partial<ProductVariant>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const existing = await getVariantById(id);
  if (!existing) return;
  // Explicit-field semantics (a present `null` clears the field); stock is
  // delta-managed via adjustVariantStock and never written from an edit.
  const has = (k: keyof ProductVariant) => Object.prototype.hasOwnProperty.call(data, k);
  const pick = <T,>(k: keyof ProductVariant, cur: T): T => (has(k) ? ((data as any)[k] ?? null) : cur);
  const next = {
    name: has('name') ? data.name! : existing.name,
    attributes: pick('attributes', existing.attributes ?? null),
    cost_price: pick('cost_price', existing.cost_price ?? null),
    selling_price: has('selling_price') ? data.selling_price! : existing.selling_price,
    reorder_level: has('reorder_level') ? data.reorder_level! : existing.reorder_level,
    barcode: pick('barcode', existing.barcode ?? null),
    is_active: has('is_active') ? data.is_active! : existing.is_active,
  };
  await db.runAsync(
    `UPDATE product_variants SET name=?, attributes=?, cost_price=?, selling_price=?, reorder_level=?, barcode=?, is_active=?, updated_at=? WHERE id=?`,
    [next.name, next.attributes, next.cost_price, next.selling_price, next.reorder_level, next.barcode, next.is_active, now, id]
  );
  const updated = await getVariantById(id);
  if (updated) {
    const pl = payload(updated) as Record<string, unknown>;
    delete pl.stock_quantity;
    await addToSyncQueue('product_variants', id, 'update', pl);
  }
}

export async function deleteVariant(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM product_variants WHERE id=?', [id]);
  await addToSyncQueue('product_variants', id, 'delete', { id });
}

/** Relative variant-stock change applied locally and queued as a server delta. */
export async function adjustVariantStock(id: string, delta: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE product_variants SET stock_quantity=stock_quantity+?, updated_at=? WHERE id=?', [delta, now, id]);
  await addStockMovementToQueue('variant', id, delta);
}

export async function decrementVariantStock(id: string, quantity: number): Promise<void> {
  await adjustVariantStock(id, -quantity);
}
