import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue, addStockMovementToQueue } from '../../services/sync/syncQueue';
import { getDeviceToken } from '../../lib/id';
import { useCurrencyStore } from '../../store/currencyStore';

export interface Order { id: string; user_id: string; total_amount: number; amount_paid?: number; status: string; sync_status?: string; customer_id?: string | null; invoice_number?: string | null; currency?: string | null; tenant_id?: string; created_at: number; }
export interface OrderItem { id: string; order_id: string; product_id: string; product_name?: string; quantity: number; unit_price: number; multiplier: number; tenant_id?: string; created_at: number; }
export interface OrderWithItems extends Order { items: OrderItem[]; }
/** A stock change to apply atomically with the sale (qty is the amount sold). */
export interface StockMovement { kind: 'product' | 'variant'; id: string; qty: number; }

/**
 * Monotonic, collision-free invoice number: INV-YYYYMMDD-####-<device>.
 * The sequence comes from a persistent per-tenant counter (survives the 30-day
 * order purge) and the device token guarantees uniqueness across offline
 * devices in the same business.
 */
async function generateInvoiceNumber(db: Awaited<ReturnType<typeof getDatabase>>, tid: string): Promise<string> {
  const name = `invoice:${tid}`;
  await db.runAsync('INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING', [name]);
  await db.runAsync('UPDATE counters SET value = value + 1 WHERE name = ?', [name]);
  const row = await db.getFirstAsync<{ value: number }>('SELECT value FROM counters WHERE name = ?', [name]);
  const seq = String(row?.value ?? 1).padStart(4, '0');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const token = await getDeviceToken();
  return `INV-${ymd}-${seq}-${token}`;
}

export async function createOrder(order: Order, items: OrderItem[], movements: StockMovement[] = []): Promise<string> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = order.tenant_id ?? getTenantId() ?? 't1';
  const invoiceNumber = order.invoice_number ?? await generateInvoiceNumber(db, tid);
  const customerId = order.customer_id ?? null;
  const amountPaid = order.amount_paid ?? order.total_amount;
  const currency = order.currency ?? useCurrencyStore.getState().code;
  // Order, line items AND stock decrement are one atomic transaction - a crash
  // can never leave a recorded sale without its stock movement (or vice versa).
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO orders (id,user_id,total_amount,amount_paid,status,sync_status,customer_id,invoice_number,currency,tenant_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [order.id,order.user_id,order.total_amount,amountPaid,order.status,'pending',customerId,invoiceNumber,currency,tid,now]);
    for (const item of items) {
      await db.runAsync('INSERT INTO order_items (id,order_id,product_id,product_name,quantity,unit_price,multiplier,tenant_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [item.id,item.order_id,item.product_id,item.product_name??null,item.quantity,item.unit_price,item.multiplier,tid,now]);
    }
    for (const m of movements) {
      const table = m.kind === 'variant' ? 'product_variants' : 'products';
      await db.runAsync(`UPDATE ${table} SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?`, [m.qty, now, m.id]);
    }
  });
  // Enqueue the order and each line item for the backend (correct Supabase table/column names)
  await addToSyncQueue('orders', order.id, 'create', {
    id: order.id, user_id: order.user_id, total_amount: order.total_amount, amount_paid: amountPaid,
    status: order.status, customer_id: customerId, invoice_number: invoiceNumber, currency,
    tenant_id: tid, created_at: now, updated_at: now,
  });
  for (const item of items) {
    await addToSyncQueue('order_items', item.id, 'create', {
      id: item.id, order_id: item.order_id, product_id: item.product_id,
      product_name: item.product_name ?? '', quantity: item.quantity,
      unit_price: item.unit_price, multiplier: item.multiplier,
      tenant_id: tid, created_at: now,
    });
  }
  // Push stock as relative deltas so concurrent multi-device sales compose.
  for (const m of movements) {
    await addStockMovementToQueue(m.kind, m.id, -m.qty);
  }
  return invoiceNumber;
}

export async function getOrders(limit = 50): Promise<Order[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  return tid
    ? db.getAllAsync<Order>('SELECT * FROM orders WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?', [tid, limit])
    : db.getAllAsync<Order>('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?', [limit]);
}

export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const db = await getDatabase();
  const tid = getTenantId();
  const order = await (tid
    ? db.getFirstAsync<Order>('SELECT * FROM orders WHERE id=? AND tenant_id=?', [id, tid])
    : db.getFirstAsync<Order>('SELECT * FROM orders WHERE id=?', [id]));
  if (!order) return null;
  const items = await db.getAllAsync<OrderItem>('SELECT * FROM order_items WHERE order_id=?', [id]);
  return { ...order, items };
}

export async function updateOrderSyncStatus(id: string, status: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE orders SET sync_status=? WHERE id=?', [status, id]);
}

async function pushOrderPayment(db: Awaited<ReturnType<typeof getDatabase>>, id: string, amountPaid: number, now: number): Promise<void> {
  await db.runAsync('UPDATE orders SET amount_paid=? WHERE id=?', [amountPaid, id]);
  await addToSyncQueue('orders', id, 'update', { id, amount_paid: amountPaid, updated_at: now });
}

/**
 * Apply a payment to a customer's outstanding invoices, oldest first.
 * Returns the amount that could not be allocated (overpayment).
 */
export async function recordCustomerPayment(customerId: string, amount: number): Promise<number> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  let remaining = amount;
  const unpaid = await db.getAllAsync<{ id: string; total_amount: number; amount_paid: number }>(
    'SELECT id, total_amount, amount_paid FROM orders WHERE customer_id=? AND amount_paid < total_amount ORDER BY created_at ASC',
    [customerId]
  );
  for (const o of unpaid) {
    if (remaining <= 0) break;
    const due = o.total_amount - o.amount_paid;
    const pay = Math.min(due, remaining);
    await pushOrderPayment(db, o.id, o.amount_paid + pay, now);
    remaining -= pay;
  }
  return remaining;
}

export async function getTodayOrdersTotal(): Promise<number> {
  const db = await getDatabase();
  const tid = getTenantId();
  const startOfDay = Math.floor(new Date().setHours(0,0,0,0) / 1000);
  const row = await (tid
    ? db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE tenant_id=? AND created_at>=?', [tid, startOfDay])
    : db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE created_at>=?', [startOfDay]));
  return row?.total ?? 0;
}
