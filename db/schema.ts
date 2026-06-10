import * as SQLite from 'expo-sqlite';

// React Native injects `__DEV__` at build time (true in dev, false in release).
declare const __DEV__: boolean;

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('enterprise_inventory.db');
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionResult?.user_version ?? 0;

  if (currentVersion === 0) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','cashier')),
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, cost_price REAL, selling_price REAL NOT NULL,
        stock_quantity INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 0,
        unit_of_measurement TEXT NOT NULL DEFAULT 'unit', category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        version INTEGER NOT NULL DEFAULT 1, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE TABLE IF NOT EXISTS product_barcodes (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        barcode_value TEXT UNIQUE NOT NULL, multiplier INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_barcodes_value ON product_barcodes(barcode_value);
      CREATE INDEX IF NOT EXISTS idx_barcodes_product ON product_barcodes(product_id);
      CREATE TABLE IF NOT EXISTS custom_field_definitions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK(field_type IN ('text','number','boolean','date')),
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS custom_field_values (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        field_definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
        value TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_custom_values_product ON custom_field_values(product_id);
      CREATE TABLE IF NOT EXISTS layout_nodes (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('section','aisle','rack','shelf')),
        parent_id TEXT REFERENCES layout_nodes(id) ON DELETE CASCADE,
        position_index INTEGER NOT NULL DEFAULT 0, metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_layout_parent ON layout_nodes(parent_id);
      CREATE TABLE IF NOT EXISTS product_locations (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        layout_node_id TEXT NOT NULL REFERENCES layout_nodes(id) ON DELETE CASCADE,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_locations_node ON product_locations(layout_node_id);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        total_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'completed',
        sync_status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_status);
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL, multiplier INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'draft',
        items_json TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('create','update','delete')),
        payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        local_payload TEXT NOT NULL, server_version TEXT, status TEXT NOT NULL DEFAULT 'unresolved',
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status);
    `);
    await database.execAsync('PRAGMA user_version = 1');
  }

  if (currentVersion < 2) {
    // Recreate users table with system_admin role + tenant_id + is_active
    await database.execAsync('PRAGMA foreign_keys = OFF');
    await database.execAsync(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','cashier','system_admin')),
        tenant_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    await database.execAsync(`
      INSERT INTO users_new (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at)
      SELECT id, email, password_hash, name, role, NULL, 1, created_at, created_at FROM users
    `);
    await database.execAsync('DROP TABLE users');
    await database.execAsync('ALTER TABLE users_new RENAME TO users');
    await database.execAsync('PRAGMA foreign_keys = ON');

    await database.execAsync('ALTER TABLE purchase_orders ADD COLUMN vendor_id TEXT');
    await database.execAsync('ALTER TABLE purchase_orders ADD COLUMN notes TEXT');
    await database.execAsync('ALTER TABLE purchase_orders ADD COLUMN received_at INTEGER');

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'standard' CHECK(plan IN ('standard','professional','enterprise')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        tenant_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id)');
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name)');

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS product_vendors (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        is_preferred INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(product_id, vendor_id)
      )
    `);
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_product_vendors_product ON product_vendors(product_id)');
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_product_vendors_vendor ON product_vendors(vendor_id)');

    await database.execAsync('PRAGMA user_version = 2');
  }

  if (currentVersion < 3) {
    // Add tenant_id to every remaining data table so all local data is tenant-scoped
    const v3Alters = [
      'ALTER TABLE products ADD COLUMN tenant_id TEXT',
      'ALTER TABLE categories ADD COLUMN tenant_id TEXT',
      'ALTER TABLE orders ADD COLUMN tenant_id TEXT',
      'ALTER TABLE order_items ADD COLUMN tenant_id TEXT',
      'ALTER TABLE layout_nodes ADD COLUMN tenant_id TEXT',
      'ALTER TABLE product_locations ADD COLUMN tenant_id TEXT',
      'ALTER TABLE product_barcodes ADD COLUMN tenant_id TEXT',
      'ALTER TABLE custom_field_definitions ADD COLUMN tenant_id TEXT',
      'ALTER TABLE custom_field_values ADD COLUMN tenant_id TEXT',
    ];
    for (const sql of v3Alters) {
      try { await database.execAsync(sql); } catch { /* column may already exist */ }
    }
    const indexSqls = [
      'CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON order_items(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_layout_nodes_tenant ON layout_nodes(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_product_barcodes_tenant ON product_barcodes(tenant_id)',
    ];
    for (const sql of indexSqls) { await database.execAsync(sql); }
    // Migrate all existing rows to the default tenant
    await database.execAsync(`
      UPDATE products                 SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE categories               SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE orders                   SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE order_items              SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE layout_nodes             SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE product_locations        SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE product_barcodes         SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE custom_field_definitions SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE custom_field_values      SET tenant_id = 't1' WHERE tenant_id IS NULL;
    `);
    await database.execAsync('PRAGMA user_version = 3');
  }

  if (currentVersion < 4) {
    // order_items needs a product_name snapshot (Supabase requires it NOT NULL)
    try { await database.execAsync('ALTER TABLE order_items ADD COLUMN product_name TEXT'); } catch { /* exists */ }
    // product_vendors must carry tenant_id to match Supabase (NOT NULL there)
    try { await database.execAsync('ALTER TABLE product_vendors ADD COLUMN tenant_id TEXT'); } catch { /* exists */ }
    try { await database.execAsync('ALTER TABLE purchase_orders ADD COLUMN tenant_id TEXT'); } catch { /* exists */ }
    await database.execAsync(`
      UPDATE product_vendors SET tenant_id = (SELECT tenant_id FROM products WHERE products.id = product_vendors.product_id) WHERE tenant_id IS NULL;
      UPDATE product_vendors SET tenant_id = 't1' WHERE tenant_id IS NULL;
      UPDATE purchase_orders SET tenant_id = 't1' WHERE tenant_id IS NULL;
    `);
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_product_vendors_tenant ON product_vendors(tenant_id)');
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id)');
    await database.execAsync('PRAGMA user_version = 4');
  }

  if (currentVersion < 5) {
    // Customers, store profile, configurable units; product images + multi-unit;
    // order invoicing; layout node images.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, notes TEXT,
        tenant_id TEXT, is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE TABLE IF NOT EXISTS store_profiles (
        id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, address TEXT, phone TEXT, email TEXT,
        tax_id TEXT, logo_uri TEXT, logo_url TEXT, footer_note TEXT,
        created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_store_profiles_tenant ON store_profiles(tenant_id);
      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, abbreviation TEXT, tenant_id TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
    `);
    const v5Alters = [
      'ALTER TABLE products ADD COLUMN image_uri TEXT',
      'ALTER TABLE products ADD COLUMN image_url TEXT',
      'ALTER TABLE products ADD COLUMN units TEXT',          // JSON array of unit names
      'ALTER TABLE orders ADD COLUMN customer_id TEXT',
      'ALTER TABLE orders ADD COLUMN invoice_number TEXT',
      'ALTER TABLE layout_nodes ADD COLUMN image_uri TEXT',
      'ALTER TABLE layout_nodes ADD COLUMN image_url TEXT',
    ];
    for (const sql of v5Alters) {
      try { await database.execAsync(sql); } catch { /* column may already exist */ }
    }
    await database.execAsync('PRAGMA user_version = 5');
  }

  if (currentVersion < 6) {
    // Partial payments / customer dues: amount_paid on orders (balance = total - paid)
    try { await database.execAsync('ALTER TABLE orders ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0'); } catch { /* exists */ }
    // Existing orders are assumed fully paid
    await database.execAsync('UPDATE orders SET amount_paid = total_amount WHERE amount_paid = 0');
    await database.execAsync('PRAGMA user_version = 6');
  }

  if (currentVersion < 7) {
    // Relax two over-strict foreign keys that caused FK-constraint errors:
    //  - orders.user_id referenced users(id): breaks for Supabase-auth UUIDs not
    //    cached locally. user_id is an external identity, not a local row.
    //  - order_items.product_id referenced products(id) with RESTRICT: blocked
    //    deleting any product that had ever been sold. Line items already
    //    snapshot product_name, so history must survive product deletion.
    // FK toggling must be outside a transaction; the table swap is wrapped in an
    // explicit BEGIN/COMMIT so a mid-migration failure rolls back instead of
    // leaving orders dropped (the data loss flagged in review).
    await database.execAsync('PRAGMA foreign_keys = OFF');
    await database.execAsync(`
      BEGIN;
      CREATE TABLE orders_new (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        total_amount REAL NOT NULL, amount_paid REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed', sync_status TEXT NOT NULL DEFAULT 'pending',
        customer_id TEXT, invoice_number TEXT, tenant_id TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
      INSERT INTO orders_new (id,user_id,total_amount,amount_paid,status,sync_status,customer_id,invoice_number,tenant_id,created_at)
        SELECT id,user_id,total_amount,COALESCE(amount_paid,total_amount),status,
               COALESCE(sync_status,'pending'),customer_id,invoice_number,tenant_id,created_at FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_status);
      CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
      CREATE TABLE order_items_new (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL, product_name TEXT, quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL, multiplier INTEGER NOT NULL DEFAULT 1,
        tenant_id TEXT, created_at INTEGER DEFAULT (unixepoch())
      );
      INSERT INTO order_items_new (id,order_id,product_id,product_name,quantity,unit_price,multiplier,tenant_id,created_at)
        SELECT id,order_id,product_id,product_name,quantity,unit_price,multiplier,tenant_id,created_at FROM order_items;
      DROP TABLE order_items;
      ALTER TABLE order_items_new RENAME TO order_items;
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON order_items(tenant_id);
      COMMIT;
    `);
    await database.execAsync('PRAGMA foreign_keys = ON');
    await database.execAsync('PRAGMA user_version = 7');
  }

  if (currentVersion < 8) {
    // Product variants: distinct SKUs of a product (size / colour / spec), each
    // with its own price, stock and barcode (paint 1L/4L, pipe diameters, etc.)
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name TEXT NOT NULL, attributes TEXT,
        cost_price REAL, selling_price REAL NOT NULL DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 0,
        barcode TEXT, tenant_id TEXT, is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
    `);
    await database.execAsync('PRAGMA user_version = 8');
  }

  if (currentVersion < 9) {
    // Per-business display currency (default INR)
    try { await database.execAsync("ALTER TABLE store_profiles ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'"); } catch { /* exists */ }
    await database.execAsync("UPDATE store_profiles SET currency = 'INR' WHERE currency IS NULL OR currency = ''");
    await database.execAsync('PRAGMA user_version = 9');
  }

  if (currentVersion < 10) {
    // Durable sync: a retry counter so transient push failures are re-attempted
    // (with backoff) instead of being abandoned forever.
    try { await database.execAsync('ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0'); } catch { /* exists */ }
    await database.execAsync('PRAGMA user_version = 10');
  }

  if (currentVersion < 11) {
    // Snapshot the display currency onto each order so historical invoices
    // always reprint in the currency they were sold in, even if the business
    // later switches currency.
    try { await database.execAsync('ALTER TABLE orders ADD COLUMN currency TEXT'); } catch { /* exists */ }
    await database.execAsync('PRAGMA user_version = 11');
  }

  if (currentVersion < 12) {
    // Monotonic, purge-safe invoice counter. The old COUNT(*)+1 scheme reset
    // after the 30-day purge and collided with historical invoice numbers.
    await database.execAsync('CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)');
    // Seed each tenant's counter from its current order count so numbering
    // continues from where it left off instead of restarting at 1.
    await database.execAsync(
      "INSERT INTO counters (name, value) SELECT 'invoice:' || COALESCE(tenant_id,'t1'), COUNT(*) FROM orders GROUP BY tenant_id ON CONFLICT(name) DO NOTHING"
    );
    await database.execAsync('PRAGMA user_version = 12');
  }

  // Demo / seed data is for local development only. Production installs start
  // empty and hydrate from Supabase on first (online) login — this is what
  // removes the shipped well-known credentials and demo tenant.
  if (__DEV__) {
    await seedDatabase(database);
    await seedV5Data(database);
  }
  await purgeOldData(database);
}

async function seedDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const userCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count > 0) {
    // Seed v2 data (tenants + vendors) if not yet present
    await seedV2Data(db);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  await db.execAsync(`
    INSERT INTO tenants (id, name, plan, is_active, created_at, updated_at) VALUES
    ('t1','Default Store','standard',1,${now},${now});
    INSERT INTO users (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at) VALUES
    ('u0','sysadmin@enterprise.com','sysadmin123','System Admin','system_admin',NULL,1,${now},${now}),
    ('u1','admin@enterprise.com','admin123','Admin User','admin','t1',1,${now},${now}),
    ('u2','cashier@enterprise.com','cashier123','Cashier User','cashier','t1',1,${now},${now});
    INSERT INTO categories (id, name, parent_id, tenant_id, created_at) VALUES
    ('c1','Electronics',NULL,'t1',${now}),
    ('c2','Mobile Phones','c1','t1',${now}),
    ('c3','Laptops','c1','t1',${now});
    INSERT INTO products (id, name, cost_price, selling_price, stock_quantity, reorder_level, unit_of_measurement, category_id, tenant_id, version, created_at, updated_at) VALUES
    ('p1','iPhone 15 Pro',800,999,12,5,'unit','c2','t1',1,${now},${now}),
    ('p2','Samsung Galaxy S24',700,899,8,5,'unit','c2','t1',1,${now},${now}),
    ('p3','MacBook Air M3',1000,1299,5,3,'unit','c3','t1',1,${now},${now}),
    ('p4','Dell XPS 13',900,1199,7,3,'unit','c3','t1',1,${now},${now}),
    ('p5','Google Pixel 8',600,799,15,5,'unit','c2','t1',1,${now},${now}),
    ('p6','OnePlus 12',650,849,3,5,'unit','c2','t1',1,${now},${now}),
    ('p7','iPad Pro 12.9',900,1099,20,5,'unit','c1','t1',1,${now},${now}),
    ('p8','AirPods Pro 2',200,249,50,10,'unit','c1','t1',1,${now},${now}),
    ('p9','Wireless Mouse',25,39,100,20,'unit','c1','t1',1,${now},${now}),
    ('p10','USB-C Hub',30,49,45,15,'unit','c1','t1',1,${now},${now});
    INSERT INTO product_barcodes (id, product_id, barcode_value, multiplier, tenant_id, created_at) VALUES
    ('b1','p1','1234567890123',1,'t1',${now}),
    ('b2','p2','2345678901234',1,'t1',${now}),
    ('b3','p3','3456789012345',1,'t1',${now}),
    ('b4','p1','CASE-IPHONE-15',12,'t1',${now});
    INSERT INTO layout_nodes (id, name, type, parent_id, position_index, metadata, tenant_id, created_at) VALUES
    ('l1','Main Store','section',NULL,0,NULL,'t1',${now}),
    ('l2','Aisle 1','aisle','l1',0,NULL,'t1',${now}),
    ('l3','Aisle 2','aisle','l1',1,NULL,'t1',${now}),
    ('l4','Rack A','rack','l2',0,NULL,'t1',${now}),
    ('l5','Rack B','rack','l2',1,NULL,'t1',${now}),
    ('l6','Shelf 1','shelf','l4',0,NULL,'t1',${now}),
    ('l7','Shelf 2','shelf','l4',1,NULL,'t1',${now}),
    ('l8','Shelf 3','shelf','l5',0,NULL,'t1',${now});
    INSERT INTO product_locations (id, product_id, layout_node_id, created_at) VALUES
    ('pl1','p1','l6',${now}),
    ('pl2','p2','l7',${now}),
    ('pl3','p3','l8',${now});
    INSERT INTO vendors (id, name, contact_person, email, phone, address, notes, tenant_id, is_active, created_at, updated_at) VALUES
    ('v1','TechDistrib Inc.','Raj Sharma','raj@techdistrib.com','+91-98765-43210','123 Tech Park, Bengaluru','Primary electronics supplier','t1',1,${now},${now}),
    ('v2','Global Electronics','Priya Patel','priya@globalelec.com','+91-87654-32109','456 Commerce St, Mumbai','Bulk orders preferred','t1',1,${now},${now});
    INSERT INTO product_vendors (id, product_id, vendor_id, is_preferred, tenant_id, created_at) VALUES
    ('pv1','p1','v1',1,'t1',${now}),('pv2','p2','v1',1,'t1',${now}),
    ('pv3','p3','v2',1,'t1',${now}),('pv4','p4','v2',0,'t1',${now});
  `);
}

async function seedV5Data(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Default configurable units for the default tenant
  const unitCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM units WHERE tenant_id = ?', ['t1']);
  if (!unitCount || unitCount.count === 0) {
    await db.execAsync(`
      INSERT INTO units (id, name, abbreviation, tenant_id, created_at) VALUES
      ('un1','Piece','pc','t1',${now}),
      ('un2','Kilogram','kg','t1',${now}),
      ('un3','Gram','g','t1',${now}),
      ('un4','Litre','L','t1',${now}),
      ('un5','Millilitre','ml','t1',${now}),
      ('un6','Box','box','t1',${now}),
      ('un7','Pack','pack','t1',${now}),
      ('un8','Dozen','dz','t1',${now});
    `);
  }
  // A default store profile so invoices have a header
  const spCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM store_profiles WHERE tenant_id = ?', ['t1']);
  if (!spCount || spCount.count === 0) {
    await db.runAsync(
      'INSERT INTO store_profiles (id, tenant_id, name, address, phone, email, tax_id, footer_note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['sp-t1', 't1', 'Default Store', '123 Market Street', '+91-00000-00000', 'store@enterprise.com', '', 'Thank you for your business!', now, now]
    );
  }
}

async function seedV2Data(db: SQLite.SQLiteDatabase): Promise<void> {
  const tenantCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants');
  if (tenantCount && tenantCount.count > 0) return;
  const now = Math.floor(Date.now() / 1000);
  await db.execAsync(`
    INSERT INTO tenants (id, name, plan, is_active, created_at, updated_at) VALUES
    ('t1','Default Store','standard',1,${now},${now});
  `);
  await db.runAsync('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL AND role != ?', ['t1', 'system_admin']);
  const sysAdminExists = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE role = ?', ['system_admin']);
  if (!sysAdminExists || sysAdminExists.count === 0) {
    await db.runAsync(
      'INSERT INTO users (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ['u0', 'sysadmin@enterprise.com', 'sysadmin123', 'System Admin', 'system_admin', null, 1, now, now]
    );
  }
  const vendorCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM vendors');
  if (!vendorCount || vendorCount.count === 0) {
    await db.execAsync(`
      INSERT INTO vendors (id, name, contact_person, email, phone, address, notes, tenant_id, is_active, created_at, updated_at) VALUES
      ('v1','TechDistrib Inc.','Raj Sharma','raj@techdistrib.com','+91-98765-43210','123 Tech Park, Bengaluru','Primary electronics supplier','t1',1,${now},${now}),
      ('v2','Global Electronics','Priya Patel','priya@globalelec.com','+91-87654-32109','456 Commerce St, Mumbai','Bulk orders preferred','t1',1,${now},${now});
    `);
  }
}

async function purgeOldData(db: SQLite.SQLiteDatabase): Promise<void> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  await db.runAsync('DELETE FROM orders WHERE sync_status = ? AND created_at < ?', ['synced', thirtyDaysAgo]);
  await db.runAsync('DELETE FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)', []);
  await db.runAsync('DELETE FROM sync_queue WHERE status = ? AND created_at < ?', ['synced', thirtyDaysAgo]);
}
