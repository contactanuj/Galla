-- ============================================================
-- Enterprise Inventory POS — Supabase Schema
-- Run this entire file in Supabase Dashboard > SQL Editor
-- BEFORE configuring the app.
-- ============================================================

-- ============================================================
-- 1. TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'standard'
                 CHECK(plan IN ('standard','professional','enterprise')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. USER PROFILES  (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK(role IN ('admin','cashier','system_admin')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ============================================================
-- 4. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  cost_price           NUMERIC,
  selling_price        NUMERIC NOT NULL,
  stock_quantity       INTEGER NOT NULL DEFAULT 0,
  reorder_level        INTEGER NOT NULL DEFAULT 0,
  unit_of_measurement  TEXT NOT NULL DEFAULT 'unit',
  category_id          TEXT REFERENCES categories(id) ON DELETE SET NULL,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant   ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);

-- ============================================================
-- 5. PRODUCT BARCODES
-- ============================================================
CREATE TABLE IF NOT EXISTS product_barcodes (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value TEXT UNIQUE NOT NULL,
  multiplier    INTEGER NOT NULL DEFAULT 1,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_barcodes_value   ON product_barcodes(barcode_value);
CREATE INDEX IF NOT EXISTS idx_barcodes_product ON product_barcodes(product_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_tenant  ON product_barcodes(tenant_id);

-- ============================================================
-- 6. VENDORS
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  notes          TEXT,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

-- ============================================================
-- 7. PRODUCT ↔ VENDOR LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS product_vendors (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendor_id    TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_product_vendors_product ON product_vendors(product_id);
CREATE INDEX IF NOT EXISTS idx_product_vendors_vendor  ON product_vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_product_vendors_tenant  ON product_vendors(tenant_id);

-- ============================================================
-- 8. STORE LAYOUT
-- ============================================================
CREATE TABLE IF NOT EXISTS layout_nodes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK(type IN ('section','aisle','rack','shelf')),
  parent_id      TEXT REFERENCES layout_nodes(id) ON DELETE CASCADE,
  position_index INTEGER NOT NULL DEFAULT 0,
  metadata       JSONB,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_layout_tenant ON layout_nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_layout_parent ON layout_nodes(parent_id);

CREATE TABLE IF NOT EXISTS product_locations (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  layout_node_id TEXT NOT NULL REFERENCES layout_nodes(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_tenant  ON product_locations(tenant_id);

-- ============================================================
-- 9. ORDERS & POS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  total_amount NUMERIC NOT NULL,
  status       TEXT NOT NULL DEFAULT 'completed',
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant     ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  unit_price   NUMERIC NOT NULL,
  multiplier   INTEGER NOT NULL DEFAULT 1,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON order_items(tenant_id);

-- ============================================================
-- 10. PURCHASE ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'draft',
  items_json  JSONB NOT NULL,
  vendor_id   TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  notes       TEXT,
  received_at TIMESTAMPTZ,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id);

-- ============================================================
-- 11. CUSTOM FIELDS (EAV)
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text','number','boolean','date')),
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id                  TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value               TEXT NOT NULL,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 12. SYNC CONFLICTS LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  local_payload JSONB NOT NULL,
  server_version JSONB,
  tenant_id     TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'unresolved',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns the tenant_id for the currently authenticated user.
-- Used in all RLS policies so tenant isolation is enforced at DB level.
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE
AS $$
  SELECT tenant_id::TEXT FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;

-- Returns true if the current user is a system_admin.
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
AS $$
  SELECT role = 'system_admin' FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;

-- Returns true if the current user may MANAGE store data (admin or system_admin).
-- Cashiers can read their tenant's data and create orders, but not edit catalog,
-- vendors, layout, etc. — enforced in the write policies below, not just the UI.
CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
AS $$
  SELECT role IN ('admin','system_admin') FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;

-- Guard against privilege escalation on user_profiles. RLS alone cannot stop a
-- user from UPDATE-ing their OWN row's role/tenant (the per-row USING check
-- still passes), so a trigger enforces that only a system_admin may set or
-- change role / tenant assignment.
CREATE OR REPLACE FUNCTION guard_profile_privilege()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- auth.uid() IS NULL ⇒ running as service_role / SQL editor (trusted), e.g.
  -- the documented first system_admin bootstrap — allow it.
  IF auth.uid() IS NULL OR is_system_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Only a system administrator may change a user''s role or tenant.';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.role = 'system_admin' THEN
      RAISE EXCEPTION 'Only a system administrator may grant the system_admin role.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile ON user_profiles;
CREATE TRIGGER trg_guard_profile BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_privilege();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_barcodes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_vendors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_nodes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts          ENABLE ROW LEVEL SECURITY;

-- TENANTS: system_admin sees all; others see their own tenant only
DROP POLICY IF EXISTS "tenants_read"   ON tenants;
DROP POLICY IF EXISTS "tenants_write"  ON tenants;
DROP POLICY IF EXISTS "tenants_update" ON tenants;
DROP POLICY IF EXISTS "tenants_delete" ON tenants;
CREATE POLICY "tenants_read"   ON tenants FOR SELECT USING (is_system_admin() OR id = get_my_tenant_id());
CREATE POLICY "tenants_write"  ON tenants FOR INSERT WITH CHECK (is_system_admin());
CREATE POLICY "tenants_update" ON tenants FOR UPDATE USING (is_system_admin());
CREATE POLICY "tenants_delete" ON tenants FOR DELETE USING (is_system_admin());

-- USER PROFILES: system_admin sees/manages all; users may read their own and
-- tenant peers. Role/tenant changes are additionally blocked by the trigger
-- above. Self-update is intentionally NOT allowed here — profile changes go
-- through the admin panel (system_admin) so a user can't edit their own record.
DROP POLICY IF EXISTS "profiles_read"   ON user_profiles;
DROP POLICY IF EXISTS "profiles_insert" ON user_profiles;
DROP POLICY IF EXISTS "profiles_update" ON user_profiles;
DROP POLICY IF EXISTS "profiles_delete" ON user_profiles;
CREATE POLICY "profiles_read"   ON user_profiles FOR SELECT USING (is_system_admin() OR tenant_id = get_my_tenant_id() OR id = auth.uid());
CREATE POLICY "profiles_insert" ON user_profiles FOR INSERT WITH CHECK (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()));
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()));
CREATE POLICY "profiles_delete" ON user_profiles FOR DELETE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()));

-- DATA TABLES: tenant isolation on read; role-gated writes.
--  * read       — any user in the tenant (or system_admin)
--  * write      — admin / system_admin only, within their tenant
-- Applied via a macro that drops existing policies first so this file is
-- safe to re-run.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'categories','products','product_barcodes','vendors','product_vendors',
    'layout_nodes','product_locations','purchase_orders',
    'custom_field_definitions','custom_field_values','sync_conflicts'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_read_%s"   ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_read_%s"   ON %I FOR SELECT USING (is_system_admin() OR tenant_id = get_my_tenant_id())', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT WITH CHECK (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
  END LOOP;
END $$;

-- ORDERS & ORDER ITEMS: cashiers MUST be able to create sales, so inserts are
-- allowed for any user in the tenant; updates/deletes are admin-only.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['orders','order_items']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_read_%s"   ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_read_%s"   ON %I FOR SELECT USING (is_system_admin() OR tenant_id = get_my_tenant_id())', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT WITH CHECK (is_system_admin() OR tenant_id = get_my_tenant_id())', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenants','user_profiles','categories','products','vendors',
    'layout_nodes','orders','purchase_orders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_%s ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- SUPABASE REALTIME (enable for multi-device live updates)
-- Idempotent: only ADD a table to the publication if not already a member.
-- ============================================================
CREATE OR REPLACE FUNCTION add_to_realtime(p_table TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = p_table
  ) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', p_table);
  END IF;
END $$;

SELECT add_to_realtime('products');
SELECT add_to_realtime('categories');
SELECT add_to_realtime('vendors');
SELECT add_to_realtime('orders');
SELECT add_to_realtime('purchase_orders');
SELECT add_to_realtime('product_barcodes');

-- ============================================================
-- v5: CUSTOMERS, STORE PROFILE, UNITS, IMAGES, INVOICING
-- ============================================================

CREATE TABLE IF NOT EXISTS units (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  abbreviation TEXT,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS store_profiles (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  tax_id      TEXT,
  logo_url    TEXT,
  footer_note TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_profiles_tenant ON store_profiles(tenant_id);

ALTER TABLE products       ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products       ADD COLUMN IF NOT EXISTS units     TEXT;
ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS currency  TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE layout_nodes ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS amount_paid    NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE units          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['units','customers','store_profiles']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_read_%s"   ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_read_%s"   ON %I FOR SELECT USING (is_system_admin() OR tenant_id = get_my_tenant_id())', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT WITH CHECK (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_updated_at_customers      ON customers;
DROP TRIGGER IF EXISTS trg_updated_at_store_profiles ON store_profiles;
CREATE TRIGGER trg_updated_at_customers      BEFORE UPDATE ON customers      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_updated_at_store_profiles BEFORE UPDATE ON store_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

SELECT add_to_realtime('customers');
SELECT add_to_realtime('store_profiles');
SELECT add_to_realtime('units');
SELECT add_to_realtime('order_items');
SELECT add_to_realtime('product_vendors');
SELECT add_to_realtime('layout_nodes');
SELECT add_to_realtime('product_locations');

-- Image storage. The bucket is public-read (so <Image> can load URLs without a
-- signed request), but writes are tenant-scoped: objects must live under a
-- `<tenant_id>/...` prefix matching the uploader's tenant, and only admins may
-- upload/modify/delete. This stops one tenant writing into another's folder.
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "images_read"   ON storage.objects;
DROP POLICY IF EXISTS "images_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_update" ON storage.objects;
DROP POLICY IF EXISTS "images_delete" ON storage.objects;
CREATE POLICY "images_read"   ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "images_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'images' AND (is_system_admin() OR (is_tenant_admin() AND (storage.foldername(name))[1] = get_my_tenant_id()))
);
CREATE POLICY "images_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'images' AND (is_system_admin() OR (is_tenant_admin() AND (storage.foldername(name))[1] = get_my_tenant_id()))
);
CREATE POLICY "images_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'images' AND (is_system_admin() OR (is_tenant_admin() AND (storage.foldername(name))[1] = get_my_tenant_id()))
);

-- ============================================================
-- v8: PRODUCT VARIANTS (size / colour / spec SKUs)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  attributes     TEXT,
  cost_price     NUMERIC,
  selling_price  NUMERIC NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level  INTEGER NOT NULL DEFAULT 0,
  barcode        TEXT,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant  ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['product_variants']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_read_%s"   ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_read_%s"   ON %I FOR SELECT USING (is_system_admin() OR tenant_id = get_my_tenant_id())', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT WITH CHECK (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
    EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE USING (is_system_admin() OR (is_tenant_admin() AND tenant_id = get_my_tenant_id()))', tbl, tbl);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_updated_at_product_variants ON product_variants;
CREATE TRIGGER trg_updated_at_product_variants BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
SELECT add_to_realtime('product_variants');

-- ============================================================
-- v9: HARDENING — FK alignment, order currency, atomic stock RPC
-- (Idempotent; safe to re-run on existing projects.)
-- ============================================================

-- (a) orders.user_id referenced auth.users(id), which blocked syncing any order
--     created under offline/local auth (the id isn't a Supabase auth uuid).
--     user_id is an external identity, not an FK — drop the constraint and store
--     it as TEXT, matching the local schema.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'orders'::regclass AND contype = 'f'
             AND pg_get_constraintdef(oid) LIKE '%user_id%' LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE orders ALTER COLUMN user_id TYPE TEXT;

-- (b) order_items.product_id RESTRICT blocked deleting any product that had ever
--     been sold, so the delete could never sync. Line items already snapshot
--     product_name, so history survives — switch the FK to ON DELETE SET NULL.
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'order_items'::regclass AND contype = 'f'
             AND pg_get_constraintdef(oid) LIKE '%product_id%' LOOP
    EXECUTE format('ALTER TABLE order_items DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- (c) Snapshot the sale currency on each order so invoices reprint correctly
--     even after the business switches its display currency.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT;

-- (d) Atomic, relative stock change. The app queues stock as +/- deltas instead
--     of absolute writes, so concurrent multi-device sales/restocks compose
--     (no lost updates, no spurious conflicts).
--
--     SECURITY DEFINER so a CASHIER can decrement stock on a sale even though
--     the products UPDATE policy is admin-only (cashiers can't edit price/name,
--     but must be able to sell). A manual tenant check inside keeps it from
--     touching another tenant's stock. It deliberately does NOT bump `version`
--     — stock deltas are commutative and must not collide with edit-OCC.
-- Returns TRUE when the delta was applied, FALSE when the target row isn't on
-- the server yet (e.g. the product create hasn't synced). The client treats
-- FALSE as a transient failure and retries, so a sale's stock decrement is
-- never silently dropped because of push ordering.
CREATE OR REPLACE FUNCTION apply_stock_delta(p_kind TEXT, p_id TEXT, p_delta INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE row_tenant TEXT;
BEGIN
  IF p_kind = 'variant' THEN
    SELECT tenant_id INTO row_tenant FROM product_variants WHERE id = p_id;
  ELSE
    SELECT tenant_id INTO row_tenant FROM products WHERE id = p_id;
  END IF;
  IF row_tenant IS NULL THEN RETURN FALSE; END IF; -- row not present yet → caller retries
  IF NOT (is_system_admin() OR row_tenant = get_my_tenant_id()) THEN
    RAISE EXCEPTION 'Not authorized to change stock for this product.';
  END IF;
  IF p_kind = 'variant' THEN
    UPDATE product_variants SET stock_quantity = stock_quantity + p_delta WHERE id = p_id;
  ELSE
    UPDATE products SET stock_quantity = stock_quantity + p_delta WHERE id = p_id;
  END IF;
  RETURN TRUE;
END $$;

-- ============================================================
-- INITIAL SETUP NOTES
-- ============================================================
-- After running this schema:
-- 1. Go to Supabase Dashboard → Authentication → Settings
--    → Disable "Confirm email" (so users can log in immediately after creation)
-- 2. Create your system admin account:
--    Dashboard → Authentication → Users → "Add user"
--    Email: sysadmin@yourcompany.com, Password: <secure>
--    Then run: INSERT INTO user_profiles (id, tenant_id, name, role)
--              VALUES ('<paste-user-id-here>', NULL, 'System Admin', 'system_admin');
-- 3. Open the app → log in as system admin → create tenants and users from the admin panel
-- ============================================================
