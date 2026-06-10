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
  const sql = `
    SELECT c.*, COUNT(o.id) as order_count,
      COALESCE(SUM(o.total_amount),0) as total_spent,
      COALESCE(SUM(o.amount_paid),0) as total_paid,
      COALESCE(SUM(o.total_amount),0) - COALESCE(SUM(o.amount_paid),0) as outstanding
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.is_active = 1 ${tid ? 'AND c.tenant_id = ?' : ''}
    GROUP BY c.id ORDER BY c.name`;
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

export async function getCustomerSummary(customerId: string, from?: number, to?: number): Promise<{ order_count: number; total_spent: number; total_paid: number; outstanding: number }> {
  const db = await getDatabase();
  const clauses = ['customer_id = ?'];
  const args: (string | number)[] = [customerId];
  if (from != null) { clauses.push('created_at >= ?'); args.push(from); }
  if (to != null) { clauses.push('created_at <= ?'); args.push(to); }
  const row = await db.getFirstAsync<{ order_count: number; total_spent: number; total_paid: number }>(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount),0) as total_spent, COALESCE(SUM(amount_paid),0) as total_paid FROM orders WHERE ${clauses.join(' AND ')}`,
    args
  );
  const r = row ?? { order_count: 0, total_spent: 0, total_paid: 0 };
  return { ...r, outstanding: r.total_spent - r.total_paid };
}
