# Galla - Inventory & POS

**Galla** (गल्ला) is a multi-tenant, offline-first **Inventory Management + Point-of-Sale** app for businesses of any kind and any scale - single shops, multi-branch retailers, warehouses, and distribution operations alike. Built with Expo (React Native) for Android, iOS, and web from a single codebase.

> "Galla" is the shop's cash till - where stock turns into sales.

---

## Highlights

- **Offline-first** - every action is written to local SQLite first, queued, and synced to Supabase when online. Works fully offline; syncs across devices when connected.
- **Multi-tenant** - each business is an isolated tenant (Supabase Row-Level Security + local tenant scoping). Run one business across many devices, or many businesses (separate logins) on one device.
- **POS** - barcode/voice search, cart, multi-unit & variant selling, partial payments, invoices (share text / PDF / print).
- **Inventory** - products with images, hierarchical categories, multi-barcode, configurable units, **multi-unit pricing**, and **product variants** (size/colour SKUs with their own price, stock & barcode).
- **Customers** - profiles, full billing history with date filters, outstanding dues / record-payment ledger.
- **Procurement & Vendors** - low-stock POs with vendor assignment; vendor CRUD with linked products.
- **Store layout** - section → aisle → rack → shelf tree, node images, product placement/relocation.
- **Admin (system_admin)** - tenants & users management; superuser writes go **directly** to Supabase.
- **Currency** - ₹ INR default, per-business configurable.
- **Theme** - Light / Dark / System.
- **i18n** - English + Hindi.

---

## Tech stack

Expo SDK 54 · Expo Router 6 · React Native 0.81 · React 19 · NativeWind 4 (Tailwind) · expo-sqlite · Supabase (`@supabase/supabase-js`) · Zustand · TanStack Query · i18next · Reanimated 4.

---

## Prerequisites

- **Node.js 20+ (64-bit)** - a 64-bit build is required (NativeWind's `lightningcss` has no 32-bit Windows binary).
- A **Supabase** project (free tier is fine) for multi-device sync. Without it the app runs local-only.
- For APK builds: an **Expo account** + `eas-cli` (cloud builds; no local Android SDK needed).

---

## Quick start (development)

```bash
npm install
# create .env from the template and fill in your Supabase values
cp .env.example .env
npx expo start            # then press a / i / w, or scan the QR in Expo Go
```

The SQLite database is created, migrated, and seeded automatically on first launch.

**Offline demo logins** (local SQLite fallback; not synced):

| Role | Email | Password |
|---|---|---|
| System Admin | `sysadmin@enterprise.com` | `sysadmin123` |
| Admin | `admin@enterprise.com` | `admin123` |
| Cashier | `cashier@enterprise.com` | `cashier123` |

---

## Supabase setup (one-time, for multi-device sync)

1. Create a Supabase project; put its URL + anon key in `.env` (and in `eas.json` build `env` for APK builds).
2. **SQL Editor** → run the entire `supabase/schema.sql` (tables, RLS, realtime, storage bucket).
3. **Authentication → Providers → Email** → turn **off "Confirm email"**.
4. Create your first **System Admin**: Authentication → Users → Add user (Auto-Confirm) → copy the UID → in SQL Editor:
   ```sql
   insert into user_profiles (id, tenant_id, name, role)
   values ('<paste-uid>', null, 'System Admin', 'system_admin');
   ```
5. Log into the app as that system admin → **Admin → Tenants / Users** to create businesses and per-device logins.

See `CLAUDE.md` for the full architecture & data-model reference.

---

## Building an APK (EAS)

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview   # produces an installable APK
```

- `eas.json` defines the `preview` (APK) profile with auto-incrementing `versionCode` and the public `EXPO_PUBLIC_*` env vars.
- EAS manages one signing **keystore** per project and reuses it for every build - **back it up** (`eas credentials`).

### Data safety across updates

Installing a new APK over the old one **preserves all data**, provided:
1. the **package id** (`com.enterprise.inventorypos`) never changes,
2. every build is signed with the **same keystore** (EAS handles this), and
3. schema changes are **additive migrations** (the app's `PRAGMA user_version` system).

Local SQLite + AsyncStorage live in the app's private storage and survive updates; only uninstall/clear-data wipes them. With Supabase configured, tenant data also lives in the cloud and re-syncs on login.

---

## Project structure

```
app/                 Expo Router screens (auth, tabs, admin, inventory, customers, vendors, invoice, ...)
components/ui/       Reusable UI (FormField, CategoryTreePicker, VariantEditor, UnitPricingEditor, ...)
constants/           roles, theme tokens
db/
  schema.ts          tables + numbered migrations (v1-v9) + seed + purge
  repositories/      one module per entity (no `db` param; tenant-scoped; enqueue or direct-sync)
hooks/               barcode scanner, voice, thermal printer, role guard, responsive layout
lib/                 supabase client, tenantContext, money (currency), units, imageUpload, id
locales/             en.json, hi.json
services/sync/       supabaseSync (pull/push/realtime/OCC), syncQueue
store/               authStore, cartStore, settingsStore, currencyStore
supabase/schema.sql  run once in the Supabase SQL editor
assets/              app icon / adaptive icon / splash / logo
```

---

## Scripts

- `npm start` / `npx expo start` - dev server
- `npx expo export --platform android` - validate a production bundle locally
- `node scripts/gen-icons.js` - regenerate app icons from `assets/logo.svg`
- `node scripts/add-dark.js` - (one-shot) apply dark-mode variants (already applied)

---

## License

[MIT](LICENSE) © 2026 Galla
