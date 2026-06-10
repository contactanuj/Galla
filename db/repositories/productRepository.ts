import { getDatabase } from '../schema';
import { getTenantId } from '../../lib/tenantContext';
import { addToSyncQueue, addStockMovementToQueue } from '../../services/sync/syncQueue';
import { deleteImage } from '../../lib/imageUpload';

function productPayload(p: Product) {
  return {
    id: p.id, name: p.name, cost_price: p.cost_price ?? null, selling_price: p.selling_price,
    stock_quantity: p.stock_quantity, reorder_level: p.reorder_level,
    unit_of_measurement: p.unit_of_measurement, category_id: p.category_id ?? null,
    image_url: p.image_url ?? null, units: p.units ?? null,
    tenant_id: p.tenant_id, version: p.version, created_at: p.created_at, updated_at: p.updated_at,
  };
}

export interface Product {
  id: string; name: string; cost_price?: number; selling_price: number;
  stock_quantity: number; reorder_level: number; unit_of_measurement: string;
  category_id?: string; image_uri?: string | null; image_url?: string | null;
  units?: string | null; tenant_id?: string; version: number;
  created_at: number; updated_at: number;
}
export interface ProductBarcode { id: string; product_id: string; barcode_value: string; multiplier: number; tenant_id?: string; }
export interface ProductWithCategory extends Product { category_name?: string; barcode_value?: string; multiplier?: number; variant_count?: number; variant_stock?: number; }

const VARIANT_AGG = `(SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=1) as variant_count,(SELECT COALESCE(SUM(stock_quantity),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=1) as variant_stock`;

function adminFields(alias = 'p') {
  return `${alias}.id,${alias}.name,${alias}.cost_price,${alias}.selling_price,${alias}.stock_quantity,${alias}.reorder_level,${alias}.unit_of_measurement,${alias}.category_id,${alias}.image_uri,${alias}.image_url,${alias}.units,${alias}.tenant_id,${alias}.version,${alias}.created_at,${alias}.updated_at`;
}
function cashierFields(alias = 'p') {
  return `${alias}.id,${alias}.name,${alias}.selling_price,${alias}.stock_quantity,${alias}.reorder_level,${alias}.unit_of_measurement,${alias}.category_id,${alias}.image_uri,${alias}.image_url,${alias}.units,${alias}.tenant_id,${alias}.version,${alias}.created_at,${alias}.updated_at`;
}

export async function getAllProducts(role: string): Promise<ProductWithCategory[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const fields = role === 'admin' ? adminFields() : cashierFields();
  return tid
    ? db.getAllAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,${VARIANT_AGG} FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.tenant_id=? ORDER BY p.name`, [tid])
    : db.getAllAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,${VARIANT_AGG} FROM products p LEFT JOIN categories c ON p.category_id=c.id ORDER BY p.name`);
}

export async function getProductById(id: string, role: string): Promise<ProductWithCategory | null> {
  const db = await getDatabase();
  const tid = getTenantId();
  const fields = role === 'admin' ? adminFields() : cashierFields();
  const row = await (tid
    ? db.getFirstAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.id=? AND p.tenant_id=?`, [id, tid])
    : db.getFirstAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.id=?`, [id]));
  return row ?? null;
}

export async function searchProducts(query: string, role: string): Promise<ProductWithCategory[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  const fields = role === 'admin' ? adminFields() : cashierFields();
  const like = `%${query}%`;
  return tid
    ? db.getAllAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,${VARIANT_AGG} FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.name LIKE ? AND p.tenant_id=? ORDER BY p.name`, [like, tid])
    : db.getAllAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,${VARIANT_AGG} FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.name LIKE ? ORDER BY p.name`, [like]);
}

export async function createProduct(product: Omit<Product, 'created_at' | 'updated_at'>): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const tid = product.tenant_id ?? getTenantId() ?? 't1';
  await db.runAsync(
    'INSERT INTO products (id,name,cost_price,selling_price,stock_quantity,reorder_level,unit_of_measurement,category_id,image_uri,image_url,units,tenant_id,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [product.id,product.name,product.cost_price??null,product.selling_price,product.stock_quantity,product.reorder_level,product.unit_of_measurement,product.category_id??null,product.image_uri??null,product.image_url??null,product.units??null,tid,product.version,now,now]
  );
  await addToSyncQueue('products', product.id, 'create', productPayload({ ...product, tenant_id: tid, created_at: now, updated_at: now } as Product));
}

export async function updateProduct(product: Partial<Product> & { id: string }): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const existing = await getProductById(product.id, 'admin');
  if (!existing) return;
  // Only overwrite a field when the caller explicitly provides it. A present
  // `null` now CLEARS the field (category, cost, image) — the old COALESCE made
  // those un-clearable. `stock_quantity` is intentionally NOT editable here:
  // stock is managed exclusively through relative deltas (adjustProductStock),
  // so a product edit can never clobber concurrent sales.
  const has = (k: keyof Product) => Object.prototype.hasOwnProperty.call(product, k);
  const pick = <T,>(k: keyof Product, cur: T): T => (has(k) ? ((product as any)[k] ?? null) : cur);
  const next = {
    name: has('name') ? product.name! : existing.name,
    cost_price: pick('cost_price', existing.cost_price ?? null),
    selling_price: has('selling_price') ? product.selling_price! : existing.selling_price,
    reorder_level: has('reorder_level') ? product.reorder_level! : existing.reorder_level,
    unit_of_measurement: has('unit_of_measurement') ? product.unit_of_measurement! : existing.unit_of_measurement,
    category_id: pick('category_id', existing.category_id ?? null),
    image_uri: pick('image_uri', existing.image_uri ?? null),
    image_url: pick('image_url', existing.image_url ?? null),
    units: pick('units', existing.units ?? null),
  };
  await db.runAsync(
    'UPDATE products SET name=?,cost_price=?,selling_price=?,reorder_level=?,unit_of_measurement=?,category_id=?,image_uri=?,image_url=?,units=?,version=?,updated_at=? WHERE id=?',
    [next.name, next.cost_price, next.selling_price, next.reorder_level, next.unit_of_measurement, next.category_id, next.image_uri, next.image_url, next.units, (existing.version || 0) + 1, now, product.id]
  );
  const updated = await getProductById(product.id, 'admin');
  if (updated) {
    const pl = productPayload(updated as Product) as Record<string, unknown>;
    delete pl.stock_quantity; // stock is delta-managed — never push an absolute value from an edit
    await addToSyncQueue('products', product.id, 'update', pl);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ image_url: string | null }>('SELECT image_url FROM products WHERE id=?', [id]);
  await db.runAsync('DELETE FROM products WHERE id=?', [id]);
  await addToSyncQueue('products', id, 'delete', { id });
  await deleteImage(existing?.image_url);
}

export async function getProductByBarcode(barcode: string, role: string): Promise<ProductWithCategory | null> {
  const db = await getDatabase();
  const tid = getTenantId();
  const fields = role === 'admin' ? adminFields() : cashierFields();
  const row = await (tid
    ? db.getFirstAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,pb.barcode_value,pb.multiplier FROM product_barcodes pb JOIN products p ON pb.product_id=p.id LEFT JOIN categories c ON p.category_id=c.id WHERE pb.barcode_value=? AND p.tenant_id=?`, [barcode, tid])
    : db.getFirstAsync<ProductWithCategory>(`SELECT ${fields},c.name as category_name,pb.barcode_value,pb.multiplier FROM product_barcodes pb JOIN products p ON pb.product_id=p.id LEFT JOIN categories c ON p.category_id=c.id WHERE pb.barcode_value=?`, [barcode]));
  return row ?? null;
}

export async function getProductBarcodes(productId: string): Promise<ProductBarcode[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductBarcode>('SELECT * FROM product_barcodes WHERE product_id=?', [productId]);
}

export async function addProductBarcode(barcode: Omit<ProductBarcode, 'created_at'>): Promise<void> {
  const db = await getDatabase();
  const tid = barcode.tenant_id ?? getTenantId() ?? 't1';
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('INSERT INTO product_barcodes (id,product_id,barcode_value,multiplier,tenant_id) VALUES (?,?,?,?,?)', [barcode.id,barcode.product_id,barcode.barcode_value,barcode.multiplier,tid]);
  await addToSyncQueue('product_barcodes', barcode.id, 'create', { id: barcode.id, product_id: barcode.product_id, barcode_value: barcode.barcode_value, multiplier: barcode.multiplier, tenant_id: tid, created_at: now });
}

export async function deleteProductBarcode(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM product_barcodes WHERE id=?', [id]);
  await addToSyncQueue('product_barcodes', id, 'delete', { id });
}

/**
 * Apply a relative stock change locally and queue it as a server-side delta.
 * Deltas compose across devices, so concurrent sales/restocks never conflict or
 * silently overwrite each other (unlike the old absolute version-checked write).
 */
export async function adjustProductStock(productId: string, delta: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync('UPDATE products SET stock_quantity=stock_quantity+?,updated_at=? WHERE id=?', [delta, now, productId]);
  await addStockMovementToQueue('product', productId, delta);
}

export async function decrementStock(productId: string, quantity: number): Promise<void> {
  await adjustProductStock(productId, -quantity);
}

export async function getLowStockProducts(): Promise<ProductWithCategory[]> {
  const db = await getDatabase();
  const tid = getTenantId();
  return tid
    ? db.getAllAsync<ProductWithCategory>(`SELECT p.id,p.name,p.selling_price,p.stock_quantity,p.reorder_level,p.unit_of_measurement,p.category_id,p.tenant_id,p.version,p.created_at,p.updated_at,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.stock_quantity<=p.reorder_level AND p.tenant_id=? ORDER BY p.stock_quantity`, [tid])
    : db.getAllAsync<ProductWithCategory>(`SELECT p.id,p.name,p.selling_price,p.stock_quantity,p.reorder_level,p.unit_of_measurement,p.category_id,p.tenant_id,p.version,p.created_at,p.updated_at,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.stock_quantity<=p.reorder_level ORDER BY p.stock_quantity`);
}
