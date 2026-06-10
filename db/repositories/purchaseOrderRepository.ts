import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { markPOItemsReceived } from './vendorRepository';
import { adjustProductStock } from './productRepository';
import { addToSyncQueue } from '../../services/sync/syncQueue';
import { newId } from '../../lib/id';

export interface PurchaseOrderItem {
  product_id: string;
  product_name: string;
  current_stock: number;
  reorder_level: number;
  suggested_quantity: number;
}

export interface PurchaseOrder {
  id: string;
  status: string;
  items_json: string;
  vendor_id: string | null;
  notes: string | null;
  received_at: number | null;
  created_at: number;
}

export interface PurchaseOrderWithVendor extends PurchaseOrder {
  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  vendor_contact: string | null;
}

export async function createPurchaseOrder(
  items: PurchaseOrderItem[],
  vendorId?: string | null,
  notes?: string | null
): Promise<string> {
  const db = await getDatabase();
  const id = newId('po');
  const now = Math.floor(Date.now() / 1000);
  const tid = getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT INTO purchase_orders (id, status, items_json, vendor_id, notes, tenant_id, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, 'draft', JSON.stringify(items), vendorId ?? null, notes ?? null, tid, now]
  );
  await addToSyncQueue('purchase_orders', id, 'create', { id, status: 'draft', items_json: items, vendor_id: vendorId ?? null, notes: notes ?? null, tenant_id: tid, created_at: now, updated_at: now });
  return id;
}

export async function getPurchaseOrders(): Promise<PurchaseOrderWithVendor[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const where = tid ? 'WHERE po.tenant_id = ?' : '';
  const sql = `
    SELECT po.*,
      v.name as vendor_name, v.phone as vendor_phone,
      v.email as vendor_email, v.contact_person as vendor_contact
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    ${where}
    ORDER BY po.created_at DESC
  `;
  return tid
    ? db.getAllAsync<PurchaseOrderWithVendor>(sql, [tid])
    : db.getAllAsync<PurchaseOrderWithVendor>(sql);
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderWithVendor | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PurchaseOrderWithVendor>(`
    SELECT po.*,
      v.name as vendor_name, v.phone as vendor_phone,
      v.email as vendor_email, v.contact_person as vendor_contact
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.id = ?
  `, [id]);
  return row ?? null;
}

/**
 * Mark a PO as received: add each ordered quantity back into product stock and
 * (if a vendor is set) link the products to that vendor. Receiving twice is
 * guarded against by ignoring already-received POs so stock isn't double-added.
 */
export async function receivePurchaseOrder(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const po = await getPurchaseOrderById(id);
  if (!po || po.status === 'received') return;

  const items: PurchaseOrderItem[] = JSON.parse(po.items_json);

  await db.runAsync(
    'UPDATE purchase_orders SET status = ?, received_at = ? WHERE id = ?',
    ['received', now, id]
  );

  // Replenish inventory by the ordered quantity (relative delta, multi-device safe).
  for (const item of items) {
    if (item.suggested_quantity > 0) await adjustProductStock(item.product_id, item.suggested_quantity);
  }

  if (po.vendor_id) {
    await markPOItemsReceived(items.map((i) => i.product_id), po.vendor_id);
  }

  await addToSyncQueue('purchase_orders', id, 'update', { id, status: 'received', received_at: now });
}

export async function assignVendorToPO(poId: string, vendorId: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE purchase_orders SET vendor_id = ? WHERE id = ?', [vendorId, poId]);
  await addToSyncQueue('purchase_orders', poId, 'update', { id: poId, vendor_id: vendorId, updated_at: now });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM purchase_orders WHERE id = ?', [id]);
  await addToSyncQueue('purchase_orders', id, 'delete', { id });
}
