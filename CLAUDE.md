# Galla — Project Documentation

## Overview

**Galla** (गल्ला) is a production-grade, **multi-tenant**, **offline-first** Inventory Management and Point-of-Sale (POS) system built with Expo (React Native). It targets businesses of **any kind and any scale** — single shops, multi-branch retailers, warehouses, and distribution operations. Android and iOS are the primary platforms; web is a secondary, progressive-enhancement target — all from one codebase.

**Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage) is the source of truth. SQLite is a local cache. Store transactions are written to SQLite first, queued, and pushed to Supabase when connectivity allows; remote changes are pulled back and applied live across devices. **Platform/superuser data (tenants, users, auth) is written directly and immediately to Supabase**, not via the offline queue.

**Default seeded credentials (local SQLite, offline fallback only):**
- System Admin: `sysadmin@enterprise.com` / `sysadmin123`
- Admin: `admin@enterprise.com` / `admin123`
- Cashier: `cashier@enterprise.com` / `cashier123`

> In a real deployment, accounts live in **Supabase Auth** (`user_profiles` table). The seeded SQLite users exist only so the app can authenticate offline if Supabase is unreachable. Login screens do not display credential hints.

See `README.md` for setup/quickstart aimed at new contributors; this file is the architecture & data-model reference.

---

## Running the App

```bash
npm install
cp .env.example .env     # fill in Supabase values (or leave blank for local-only)
npx expo start           # then a / i / w, or scan the QR
```

The SQLite database is created, migrated, and seeded automatically on first launch. **Node.js 20+ 64-bit is required** (NativeWind's `lightningcss` has no 32-bit Windows binary).

### Supabase setup (one-time)

1. Create a Supabase project. Put the URL + anon key in `.env` (and in `eas.json` `env` for APK builds):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
   ```
   Use a **legacy anon JWT** key; the newer `sb_publishable_*` keys can 401 on PostgREST with this setup.
2. Run `supabase/schema.sql` in the Dashboard → SQL Editor (all tables, `get_my_tenant_id()` / `is_system_admin()` helpers, RLS policies, `touch_updated_at` trigger, Realtime, and the `images` Storage bucket + policies).
3. Authentication → Providers → Email → **turn off "Confirm email"** so admin-created users can sign in immediately.
4. Seed the first `system_admin` row in `user_profiles` (Authentication → Users → Add user with Auto-Confirm → copy UID → insert a `user_profiles` row with `role='system_admin'`, `tenant_id=null`).

If the Supabase env vars are absent, the app runs in **local-only mode**. `supabaseEnabled` in `lib/supabase.ts` gates all backend calls.

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | Expo SDK ~54, Expo Router ~6 (file-based routing), React 19, React Native 0.81 |
| Styling | NativeWind v4 (Tailwind CSS for RN); light/dark/system theming via `colorScheme` |
| Local DB | expo-sqlite ~16 |
| Backend | Supabase (`@supabase/supabase-js` ^2) + `react-native-url-polyfill` |
| Global state | Zustand ^5 (persisted via AsyncStorage) |
| Server-state / cache | TanStack React Query ^5 |
| i18n | i18next ^24 + react-i18next ^15 (en / hi) |
| Animation / gestures | react-native-reanimated ~4 (+ react-native-worklets), react-native-gesture-handler ~2 |
| Icons | lucide-react-native |
| Networking | @react-native-community/netinfo |
| Persistence | @react-native-async-storage/async-storage |
| Camera / images | expo-camera ~16, expo-image-picker ~17 |
| Printing / sharing | expo-print, expo-sharing, expo-clipboard |
| App shell | expo-splash-screen, expo-status-bar |
| Haptics | expo-haptics |

---

## Project Structure

```
app/                         # Expo Router screens
  _layout.tsx                # Root: DB init, restoreSession, theme + currency hydrate, sync, auth guard
  (auth)/login.tsx           # Supabase Auth (falls back to local SQLite offline)
  (app)/
    (tabs)/                  # store tabs hidden for system_admin
      index.tsx pos.tsx inventory.tsx procurement.tsx layout.tsx vendors.tsx settings.tsx
    inventory/new.tsx  inventory/[id].tsx
    vendors/new.tsx    vendors/[id].tsx
    customers/index.tsx customers/new.tsx customers/[id].tsx
    invoice/[id].tsx         # shareable / printable / PDF invoice
    categories.tsx           # category tree management
    units.tsx                # unit-of-measure management
    store-profile.tsx        # store details, logo, currency
    admin/                   # system_admin only — index, tenants, users
components/ui/
  FormField.tsx  LanguageToggle.tsx  RoleGate.tsx
  CategoryTreePicker.tsx  UnitPricingEditor.tsx  VariantEditor.tsx
constants/  roles.ts  theme.ts
db/
  schema.ts                  # tables, numbered migrations (v1–v9), seeding, purge
  repositories/              # one module per entity (no `db` param; tenant-scoped)
    productRepository  categoryRepository  variantRepository  unitRepository
    orderRepository    purchaseOrderRepository  vendorRepository  layoutRepository
    customerRepository storeProfileRepository  tenantRepository  userRepository
hooks/  useBarcodeScanner  useVoiceInput  useThermalPrinter  useRoleGuard  useResponsiveLayout  useFrameworkReady
lib/
  supabase.ts                # client + supabaseEnabled + exported url/anon key
  tenantContext.ts           # module-level tenant singleton (set post-login)
  money.ts                   # CURRENCIES, formatMoney(), useMoney() — currency formatting
  units.ts                   # unit helpers
  imageUpload.ts             # chooseImageSource (camera/gallery), upload/delete to Storage
  id.ts                      # newId(prefix) — client-side id/idempotency-key generator
locales/  en.json  hi.json
services/sync/
  syncQueue.ts               # enqueue / read / mark sync_queue + sync_conflicts
  supabaseSync.ts            # pullLatest, processSyncQueue, subscribeRealtime, OCC, pushImmediate
store/  authStore  cartStore  settingsStore (language + theme)  currencyStore
supabase/schema.sql          # run once in the Supabase SQL Editor
scripts/  gen-icons.js (logo → PNGs)  add-dark.js (one-shot dark-variant pass)
assets/   logo.svg + generated icon / adaptive-icon / splash / favicon / logo-transparent
i18n.ts  global.css  tailwind.config.js  babel.config.js  app.config.js  eas.json
```

---

## Architecture

### Two sync paths

**1. Store transactions → offline queue (offline-first).** Products, categories, variants, units, orders, customers, vendors, layout, purchase orders, store profile:

```
UI → Repository (db/repositories/) → SQLite write (authoritative locally)
   → addToSyncQueue(table, id, op, payload)        ← Supabase-shaped payload
       → processSyncQueue() pushes (login, foreground, realtime tick)
       → pullLatest() applies remote deltas back into SQLite
       → subscribeRealtime() fires push+pull on remote changes
```

**2. Platform/superuser data → direct & immediate.** Tenants and users/auth do **not** use the queue — they write straight to Supabase and surface errors:
- `tenantRepository` (`createTenant`/`updateTenant`/`deleteTenant`) writes local SQLite **and** directly `upsert`/`delete`s `tenants` in Supabase (throws on failure).
- User creation (`app/(app)/admin/users.tsx`) does `signUp` on a **throwaway client** (so the admin's session isn't replaced), then inserts `user_profiles` with the **main** (system_admin) client. It first upserts the chosen tenant so the `tenant_id` foreign key always holds.

The `sync_queue` table records every `create/update/delete` with `status = pending | synced | failed`. `pullLatest()` is incremental, tracking the last-pulled ISO timestamp **per business** in AsyncStorage (`supabase_last_pulled_at:<tenant|admin>`). `tenants` is pulled only for system_admin (it has no `tenant_id` column).

`app/_layout.tsx` orchestrates startup: `initializeDatabase()` → `restoreSession()` → hydrate theme + currency; on auth, initial `processSyncQueue()` + `pullLatest()` + `subscribeRealtime()`; on foreground, push then pull.

### Multi-Tenancy

Every store-domain table carries `tenant_id`. Isolation is enforced on both ends:
- **Supabase:** RLS. `get_my_tenant_id()` reads the caller's tenant from `user_profiles`; policies allow a row only when `tenant_id = get_my_tenant_id()` OR `is_system_admin()`.
- **Local SQLite:** repositories filter by the **`getTenantId()` module singleton** (`lib/tenantContext.ts`), set at login. They never take a `tenant_id` argument; on insert they stamp `getTenantId() ?? 't1'`.

`system_admin` has `tenant_id = null` → unscoped queries. To avoid merging store data across tenants, the store tabs are hidden for system_admin in `(tabs)/_layout.tsx`; the Dashboard shows an admin-panel shortcut.

### Roles (3-tier)

`constants/roles.ts`: `UserRole = 'system_admin' | 'admin' | 'cashier'`, `ROLE_HIERARCHY` (3/2/1), `hasMinimumRole()`. `cost_price` is excluded at the **query level** in `productRepository` for non-admins. `useRoleGuard(role)` → `{ hasAccess, isAdmin, isSystemAdmin }`; `<RoleGate role>` gates children.

### Optimistic Concurrency Control (OCC)

`products.version` (starts at 1). `updateProduct()` / `decrementStock()` increment it and enqueue the post-update row. On push, `processSyncQueue()` does a version-checked update (`… WHERE id = ? AND version = newVersion-1`). If no row matches but the row exists server-side, a `sync_conflicts` row is written and the item marked `failed`; if absent, it's inserted fresh. Conflicts surface on the admin Sync Conflicts view.

### Order / record idempotency

Client-side ids (`lib/id.ts` `newId()`) are generated before the SQLite write and reused as the Supabase primary key, so retried pushes de-duplicate by `id`. `createOrder()` wraps order + order_items + stock decrement in a single SQLite transaction, then enqueues each row; the order is marked `synced` after a successful push.

---

## Database Schema (local SQLite)

Database file: **enterprise_inventory.db** (WAL, foreign keys ON). Built/migrated by `db/schema.ts` via `PRAGMA user_version`.

> The Supabase counterpart is `supabase/schema.sql`. Type adaptations: SQLite `INTEGER` Unix-seconds ↔ Supabase `TIMESTAMPTZ`; `0/1` ↔ `BOOLEAN`; `TEXT` JSON ↔ `JSONB`. `supabaseSync.ts` converts and strips columns the local table lacks.

### Core tables (store tables include `tenant_id TEXT`)

| Table | Notable columns |
|---|---|
| `tenants` | id, name, plan (`standard\|professional\|enterprise`), is_active, timestamps |
| `users` | id, email, password_hash, name, role, tenant_id, is_active — *local auth fallback / cache* |
| `categories` | id, name, parent_id (self-FK, infinite nesting), tenant_id, timestamps |
| `products` | id, name, cost_price (admin-only), selling_price, stock_quantity, reorder_level, unit_of_measurement, category_id, image_url, tenant_id, **version**, timestamps |
| `product_variants` | id, product_id, name, sku, barcode, price_delta/selling_price, stock_quantity, tenant_id |
| `product_barcodes` | id, product_id, barcode_value (unique), multiplier, tenant_id |
| `units` | id, name, abbreviation, tenant_id — tenant-defined units of measure |
| `vendors` | id, name, contact_person, email, phone, address, notes, tenant_id, is_active (soft delete), timestamps |
| `product_vendors` | id, product_id, vendor_id, is_preferred, tenant_id — UNIQUE(product_id, vendor_id) |
| `layout_nodes` | id, name, type (`section\|aisle\|rack\|shelf`), parent_id, position_index, image_url, metadata, tenant_id |
| `product_locations` | id, product_id, layout_node_id, tenant_id |
| `customers` | id, name, phone, email, address, notes, tenant_id, is_active, timestamps |
| `orders` | id (idempotency key), user_id, customer_id, total_amount, **amount_paid**, invoice_number, status, sync_status (local-only), tenant_id, created_at |
| `order_items` | id, order_id, product_id, product_name (snapshot), quantity, unit_price, multiplier, tenant_id, created_at |
| `purchase_orders` | id, status (`draft\|received`), items_json, vendor_id, notes, received_at, tenant_id, created_at |
| `store_profiles` | id, name, address, phone, email, tax_id, footer_note, logo_uri, logo_url, **currency**, tenant_id |
| `custom_field_definitions` / `custom_field_values` | EAV for tenant-defined product attributes (defined; UI not yet wired) |
| `sync_queue` | id, entity_type, entity_id, operation, payload (JSON), status, created_at |
| `sync_conflicts` | id, entity_type, entity_id, local_payload, server_version, status, created_at |

### Migrations (`db/schema.ts`)

| Version | Adds |
|---|---|
| v1 | Original single-tenant schema |
| v2 | Recreates `users` (system_admin + tenant_id + is_active); adds `tenants`, `vendors`, `product_vendors`; vendor_id/notes/received_at on `purchase_orders` |
| v3 | `tenant_id` on all remaining tables + indexes; backfills existing rows to `t1` |
| v4 | `order_items.product_name`; `tenant_id` on `product_vendors` + `purchase_orders` |
| v5 | `customers`, `store_profiles`, `units`; product `image_url`; layout `image_url`; order `customer_id` / `invoice_number` |
| v6 | `orders.amount_paid` (partial payments / dues) |
| v7 | Recreates `orders` + `order_items` dropping the `user_id` / `product_id` FKs (foreign_keys OFF during copy) so deletes don't cascade-block |
| v8 | `product_variants` table |
| v9 | `store_profiles.currency` (default `'INR'`) |

Append a new migration as `if (currentVersion < N) { … PRAGMA user_version = N }`. **Migrations are additive** so app updates never lose data.

### Data purging

On startup `purgeOldData()` removes `synced` orders older than 30 days (items cascade) and prunes old `synced` sync_queue rows — a no-op in local-only mode (orders only become `synced` after a successful push).

---

## Repositories

All DB access goes through `db/repositories/` (no `db` param; each calls `getDatabase()`). Reads filter by `getTenantId()`; store mutations stamp `tenant_id` and `addToSyncQueue(...)`; **tenant mutations push directly to Supabase**. No UI imports `expo-sqlite`. Ids come from `newId()` (`lib/id.ts`).

- **productRepository** — `getAllProducts/ById/searchProducts(role)` (cost_price excluded for non-admins; variant-stock aggregated), CRUD, barcodes, `decrementStock`, `getLowStockProducts`, image cleanup on delete.
- **variantRepository** — variant CRUD, `getVariantByBarcode`, `decrementVariantStock`.
- **categoryRepository** — tree CRUD + `getCategoryPath` (breadcrumb).
- **unitRepository** — unit-of-measure CRUD.
- **orderRepository** — `createOrder` (atomic txn), `getOrders/ById`, `getTodayOrdersTotal`, `recordCustomerPayment`, sync-status helpers.
- **customerRepository** — CRUD, `getCustomerOrders` / `getCustomerSummary` (date-range filters), dues.
- **storeProfileRepository** — get/upsert store profile incl. currency + logo.
- **purchaseOrderRepository** — PO CRUD, `receivePurchaseOrder` (links items to vendor).
- **vendorRepository** — vendor CRUD (soft delete) + product↔vendor links + preferred vendor.
- **layoutRepository** — node CRUD, move/reorder, product placement/relocation, node images.
- **tenantRepository** — *(system_admin)* CRUD that **syncs directly to Supabase**.
- **userRepository** — local cache; real user creation is via Supabase Auth in the admin screen.

---

## Services — `services/sync/`

- **syncQueue.ts** — `addToSyncQueue`, `getPendingSyncItems`, `markSyncItemStatus`, `createSyncConflict`, `getSyncConflicts`, `resolveSyncConflict`.
- **supabaseSync.ts** — `pullLatest()` (incremental, per-business cursor, parent→child, tenants only for system_admin), `processSyncQueue()` (OCC on products, idempotent upserts), `pushImmediate()`, `subscribeRealtime(onUpdate)`.

*(The legacy `syncService.ts` REST skeleton has been removed.)*

---

## Zustand Stores

- **authStore** (`auth-storage`) — `{ userId, email, name, role, tenantId, isAuthenticated, login, logout, restoreSession }`. Supabase Auth → `user_profiles`, with SQLite fallback offline. All keep `lib/tenantContext.ts` in sync via `setCurrentTenant`.
- **cartStore** (in-memory) — items keyed by `productId::variantId::unitLabel`; `addItem`, `removeItem`, `updateQuantity`, `clearCart`, `getTotal`, `getItemCount`.
- **settingsStore** (`settings-storage`) — `language: 'en'|'hi'`, `theme: 'light'|'dark'|'system'` + setters.
- **currencyStore** (`currency-storage`) — `{ code, setCurrency }`; drives `lib/money.ts` formatting.

---

## Hooks

- **useBarcodeScanner** — native expo-camera; web simulates a USB HID scanner. Resolves `product_barcodes`/variant barcodes, multiplies cart qty.
- **useVoiceInput** — web `SpeechRecognition`; native voice is a no-op (package not bundled).
- **useThermalPrinter** — web `window.print()`, native ESC/POS.
- **useRoleGuard / useIsAdmin / useIsSystemAdmin**, **useResponsiveLayout** (`isCompact <640`, `isTablet 640–1024`, `isDesktop ≥1024`).

---

## Theming & Currency

- **Theme:** `settingsStore.theme` drives NativeWind's `colorScheme.set(theme)` in `app/_layout.tsx`; `<StatusBar style="auto" />` adapts. Screens carry `dark:` variants on neutral surfaces/text/borders. Toggle in **Settings → Appearance** (Light / Dark / System); splash has a dark variant.
- **Currency:** ₹ INR default. `lib/money.ts` exposes `CURRENCIES`, `formatMoney()` (non-reactive) and `useMoney()` (reactive). Set per-business in **Store Profile**; persisted in `currencyStore` and hydrated on launch/pull.

---

## Internationalization

All UI strings via `t('key')`. Files: `locales/en.json`, `locales/hi.json`. The app name is localized (`appName` = "Galla" / "गल्ला"). Language persists in `settingsStore`, restored in the root layout.

---

## Branding, Icons & Build/Deploy

- **Branding:** app name **Galla** (`app.config.js` `name`, i18n `appName`, receipt header). The logo lives at `assets/logo.svg`; `node scripts/gen-icons.js` rasterizes it (via `sharp`) into `icon.png` (opaque, iOS), `adaptive-icon.png` (transparent foreground), `splash-icon.png`, `favicon.png`, `logo-transparent.png`. Wired in `app.config.js` (icon, Android adaptive icon, `expo-splash-screen` plugin with light/dark backgrounds).
- **Build:** `npx eas-cli build -p android --profile preview` → installable APK. `eas.json` sets `buildType: apk`, `autoIncrement`, remote version source, and the `EXPO_PUBLIC_*` env.
- **Data safety across updates:** preserved as long as the **package id** (`com.enterprise.inventorypos`) is unchanged, every build uses the **same EAS-managed keystore**, and migrations stay additive. Validate a build locally with `npx expo export --platform android` before shipping.

---

## Screens

- **Dashboard** — store rollups (Products, Low Stock, Today's Sales, Sync Conflicts) for admin/cashier; admin-panel shortcut for system_admin.
- **POS** — split-panel on tablet/web. Barcode/voice search; **variant + unit pickers**; cart with multiplier; **amount paid / balance due**; "Complete Sale" → atomic order + stock decrement (variant or base) + sync; receipt + invoice.
- **Inventory / New / Edit Product** — CRUD with hierarchical **CategoryTreePicker**, multi-barcode, **multi-unit pricing**, **variants**, product image (camera/gallery); role-gated cost price.
- **Customers** — list/search; profile with billing history (date-range filters), **outstanding dues** + **Record Payment**.
- **Invoice** — per-order invoice: share text, **PDF** (expo-print), or thermal print; uses store profile + currency.
- **Procurement** — Low-Stock (deficit-sorted, "Generate PO" + vendor picker) + Orders (PO history, "Mark as Received").
- **Vendors / New / Edit** — searchable list with product counts; CRUD (soft delete); linked products + PO history.
- **Store Layout** — section→aisle→rack→shelf tree; add/rename/delete, move/reorder, node images, product placement/relocation.
- **Categories / Units** — management screens for the category tree and units of measure.
- **Store Profile** — store details, logo, **currency** (admin).
- **Settings** — Appearance (theme), language, role badge, management links, Sync Conflicts (admin), System Administration (system_admin), logout.
- **Admin (system_admin)** — platform dashboard; **Tenants** CRUD (direct Supabase sync); **Users** CRUD (Supabase Auth + profile, tenant assignment).

---

## Access Control Summary

| Feature | system_admin | admin | cashier |
|---|---|---|---|
| Admin panel (tenants, users) | ✓ | ✗ | ✗ |
| Dashboard | shortcut only | ✓ | ✓ |
| POS / Product search | ✗ (hidden) | ✓ | ✓ |
| Inventory / Variants CRUD | ✗ (hidden) | ✓ | ✗ |
| Cost Price field | ✗ | ✓ | ✗ (excluded at query level) |
| Procurement / Vendors / Layout / Customers | ✗ (hidden) | ✓ | ✗ |
| Store Profile / Currency | ✗ | ✓ | ✗ |
| Sync Conflicts | ✓ | ✓ | ✗ |
| Settings (incl. theme/language) | ✓ | ✓ | ✓ |

Store tabs are hidden for system_admin to avoid cross-tenant data merging.

---

## Key Patterns & Conventions

- **No hardcoded UI strings** — everything via `t('key')`.
- **No direct SQLite in components** — all DB access via `db/repositories/` (no `db` param).
- **Cost price excluded at query level** — never rely on the UI to hide sensitive fields.
- **Tenant scoping via `getTenantId()` singleton** — set at login; repositories never take a tenant argument.
- **Two sync paths** — store data enqueues a Supabase-shaped payload; **superuser data (tenants/users/auth) writes directly + immediately** and surfaces errors.
- **Client-side ids (`newId`) as idempotency keys** — generated before any write, reused as the Supabase PK.
- **Single SQLite transaction for order creation**; **OCC** via `products.version`.
- **Soft deletes** — vendors, tenants, users, customers use `is_active = 0`.
- **Money via `lib/money.ts`** — never hardcode currency symbols or `toFixed(2)`.
- **`supabaseEnabled` gates all backend calls** — clean degradation to local-only mode.
- **Additive migrations only** — preserves data across app updates.
