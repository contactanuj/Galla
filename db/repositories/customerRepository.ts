import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue } from '../../services/sync/syncQueue';
import { newId } from '../../lib/id';

export interface Customer {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; tenant_id: string | null;
  is_active: number; created_at: number; updated_at: number;
}

export interface CustomerWithStats extends Customer {
  order_count: number;
  total_spent: number;
  total_paid: number;
  outstanding: number;
}

export interface CustomerOrder {
  id: string; invoice_number: string | null; total_amount: number; amount_paid: number; created_at: number;
}

export interface CustomerPayment {
  id: string; amount: number; note: string | null; created_at: number;
}

function payload(c: Customer) {
  return {
    id: c.id, name: c.name, phone: c.phone ?? null, email: c.email ?? null,
    address: c.address ?? null, notes: c.notes ?? null, tenant_id: c.tenant_id,
    is_active: c.is_active, created_at: c.created_at, updated_at: c.updated_at,
  };
}

export async function getAllCustomers(): Promise<CustomerWithStats[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  // Subqueries (not a JOIN) so order rows and payment rows don't multiply.
  const sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders o WHERE o.customer_id = c.id) as total_spent,
      ((SELECT COALESCE(SUM(amount_paid),0) FROM orders o WHERE o.customer_id = c.id)
       + (SELECT COALESCE(SUM(amount),0) FROM customer_payments p WHERE p.customer_id = c.id)) as total_paid,
      ((SELECT COALESCE(SUM(total_amount),0) FROM orders o WHERE o.customer_id = c.id)
       - (SELECT COALESCE(SUM(amount_paid),0) FROM orders o WHERE o.customer_id = c.id)
       - (SELECT COALESCE(SUM(amount),0) FROM customer_payments p WHERE p.customer_id = c.id)) as outstanding
    FROM customers c
    WHERE c.is_active = 1 ${tid ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.name`;
  return tid
    ? db.getAllAsync<CustomerWithStats>(sql, [tid])
    : db.getAllAsync<CustomerWithStats>(sql);
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Customer>('SELECT * FROM customers WHERE id = ?', [id]);
  return row ?? null;
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const like = `%${query}%`;
  const sql = `SELECT * FROM customers WHERE is_active = 1 ${tid ? 'AND tenant_id = ?' : ''}
    AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name`;
  return tid
    ? db.getAllAsync<Customer>(sql, [tid, like, like, like])
    : db.getAllAsync<Customer>(sql, [like, like, like]);
}

export async function createCustomer(data: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'tenant_id'> & { tenant_id?: string | null }): Promise<string> {
  const db = await getDatabase();
  const id = newId('cust');
  const now = Math.floor(Date.now() / 1000);
  const tid = data.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT INTO customers (id, name, phone, email, address, notes, tenant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, data.name, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, tid, 1, now, now]
  );
  await addToSyncQueue('customers', id, 'create', payload({ ...data, id, tenant_id: tid, is_active: 1, created_at: now, updated_at: now } as Customer));
  return id;
}

export async function updateCustomer(id: string, data: Partial<Omit<Customer, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `UPDATE customers SET name=COALESCE(?,name), phone=COALESCE(?,phone), email=COALESCE(?,email),
     address=COALESCE(?,address), notes=COALESCE(?,notes), is_active=COALESCE(?,is_active), updated_at=? WHERE id=?`,
    [data.name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.is_active ?? null, now, id]
  );
  const updated = await getCustomerById(id);
  if (updated) await addToSyncQueue('customers', id, 'update', payload(updated));
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?', [now, id]);
  const updated = await getCustomerById(id);
  if (updated) await addToSyncQueue('customers', id, 'update', payload(updated));
}

/** Customer's billing history, optionally filtered by a created_at range (unix seconds). */
export async function getCustomerOrders(customerId: string, from?: number, to?: number): Promise<CustomerOrder[]> {
  const db = await getDatabase();
  const clauses = ['customer_id = ?'];
  const args: (string | number)[] = [customerId];
  if (from != null) { clauses.push('created_at >= ?'); args.push(from); }
  if (to != null) { clauses.push('created_at <= ?'); args.push(to); }
  return db.getAllAsync<CustomerOrder>(
    `SELECT id, invoice_number, total_amount, amount_paid, created_at FROM orders WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    args
  );
}

/** Record money received from a customer that is NOT tied to a purchase (a credit
 * against their dues, or an advance). This is the ledger entry for "they just paid". */
export async function addCustomerPayment(customerId: string, amount: number, note: string | null = null): Promise<string> {
  const db = await getDatabase();
  const id = newId('pay');
  const tid = getTenantId() ?? 't1';
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    'INSERT INTO customer_payments (id, customer_id, amount, note, tenant_id, created_at) VALUES (?,?,?,?,?,?)',
    [id, customerId, amount, note, tid, now]
  );
  await addToSyncQueue('customer_payments', id, 'create', { id, customer_id: customerId, amount, note, tenant_id: tid, created_at: now });
  return id;
}

/** Standalone payments (credits) for a customer, optionally within a date range. */
export async function getCustomerPayments(customerId: string, from?: number, to?: number): Promise<CustomerPayment[]> {
  const db = await getDatabase();
  const clauses = ['customer_id = ?'];
  const args: (string | number)[] = [customerId];
  if (from != null) { clauses.push('created_at >= ?'); args.push(from); }
  if (to != null) { clauses.push('created_at <= ?'); args.push(to); }
  return db.getAllAsync<CustomerPayment>(
    `SELECT id, amount, note, created_at FROM customer_payments WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
    args
  );
}

/** Settle the customer's entire outstanding balance with one credit entry. */
export async function settleCustomerDues(customerId: string): Promise<number> {
  const { outstanding } = await getCustomerSummary(customerId);
  if (outstanding > 0) await addCustomerPayment(customerId, outstanding, 'Dues cleared');
  return outstanding;
}

/** Permanently delete the customer's order + payment history. Irreversible. */
export async function clearCustomerHistory(customerId: string): Promise<number> {
  const db = await getDatabase();
  const orders = await db.getAllAsync<{ id: string }>('SELECT id FROM orders WHERE customer_id = ?', [customerId]);
  for (const o of orders) {
    const items = await db.getAllAsync<{ id: string }>('SELECT id FROM order_items WHERE order_id = ?', [o.id]);
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [o.id]);
    for (const it of items) await addToSyncQueue('order_items', it.id, 'delete', { id: it.id });
    await db.runAsync('DELETE FROM orders WHERE id = ?', [o.id]);
    await addToSyncQueue('orders', o.id, 'delete', { id: o.id });
  }
  const pays = await db.getAllAsync<{ id: string }>('SELECT id FROM customer_payments WHERE customer_id = ?', [customerId]);
  await db.runAsync('DELETE FROM customer_payments WHERE customer_id = ?', [customerId]);
  for (const p of pays) await addToSyncQueue('customer_payments', p.id, 'delete', { id: p.id });
  return orders.length;
}

export async function getCustomerSummary(customerId: string, from?: number, to?: number): Promise<{ order_count: number; total_spent: number; total_paid: number; outstanding: number }> {
  const db = await getDatabase();
  const oClauses = ['customer_id = ?'];
  const oArgs: (string | number)[] = [customerId];
  if (from != null) { oClauses.push('created_at >= ?'); oArgs.push(from); }
  if (to != null) { oClauses.push('created_at <= ?'); oArgs.push(to); }
  const orow = await db.getFirstAsync<{ order_count: number; total_spent: number; order_paid: number }>(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount),0) as total_spent, COALESCE(SUM(amount_paid),0) as order_paid FROM orders WHERE ${oClauses.join(' AND ')}`,
    oArgs
  );
  const pClauses = ['customer_id = ?'];
  const pArgs: (string | number)[] = [customerId];
  if (from != null) { pClauses.push('created_at >= ?'); pArgs.push(from); }
  if (to != null) { pClauses.push('created_at <= ?'); pArgs.push(to); }
  const prow = await db.getFirstAsync<{ payments: number }>(
    `SELECT COALESCE(SUM(amount),0) as payments FROM customer_payments WHERE ${pClauses.join(' AND ')}`,
    pArgs
  );
  // Outstanding is the current ALL-TIME balance (independent of the range filter).
  const all = await db.getFirstAsync<{ t: number; op: number; p: number }>(
    `SELECT
       (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id = ?) as t,
       (SELECT COALESCE(SUM(amount_paid),0) FROM orders WHERE customer_id = ?) as op,
       (SELECT COALESCE(SUM(amount),0) FROM customer_payments WHERE customer_id = ?) as p`,
    [customerId, customerId, customerId]
  );
  const order_count = orow?.order_count ?? 0;
  const total_spent = orow?.total_spent ?? 0;
  const total_paid = (orow?.order_paid ?? 0) + (prow?.payments ?? 0);
  const outstanding = (all?.t ?? 0) - (all?.op ?? 0) - (all?.p ?? 0);
  return { order_count, total_spent, total_paid, outstanding };
}
