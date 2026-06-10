# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Galla** branding: app name (en) + Devanagari **गल्ला** (hi), logo wired as icon / Android adaptive icon / splash / favicon (generated from `assets/logo.svg` via `scripts/gen-icons.js`).
- **Light / Dark / System** theming (Settings → Appearance) with `dark:` variants across all screens and an adaptive status bar / splash.
- **Image capture**: every image field (product, store logo, layout node) now offers **Take Photo** or **Choose from Gallery**.
- Product **variants** (size/colour SKUs), **multi-unit pricing**, units management, and a hierarchical category picker.
- **Customers** with billing history, outstanding dues, and record-payment ledger.
- **Invoices**: share text, PDF (expo-print), or thermal print.
- Per-business **currency** (₹ INR default) and store profile.
- Standard repo files: `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `CHANGELOG`, `.env.example`, `.editorconfig`, `.gitattributes`, `.nvmrc`, GitHub issue/PR templates, CI workflow, Dependabot.

### Changed
- **Superuser/platform data (tenants, users, auth) now writes directly and immediately to Supabase**, bypassing the offline sync queue, and surfaces errors. The queue is reserved for store transactions.
- User creation upserts the chosen tenant to Supabase first, so the `user_profiles.tenant_id` foreign key always holds.
- Incremental pull now tracks the last-pulled cursor **per business**.

### Fixed
- User creation no longer hijacks the admin's Supabase session (sign-up runs on a throwaway client), so the `user_profiles` row is written reliably.
- `tenants` now sync to Supabase (previously local-only) and are pulled for system_admin.
- Store-layout node creation no longer fails the parent foreign key at the root.

### Removed
- Legacy `services/sync/syncService.ts` REST skeleton.

## [1.0.0]

- Initial multi-tenant, offline-first Inventory + POS: products, barcodes, categories,
  vendors, procurement/POs, store layout, orders/POS, optimistic concurrency, and
  Supabase sync with Row-Level Security.
