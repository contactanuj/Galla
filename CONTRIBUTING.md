# Contributing to Galla

Thanks for your interest in improving Galla! This guide covers how to set up, the conventions we follow, and how to submit changes.

## Development setup

Requires **Node.js 20+ (64-bit)**.

```bash
npm install
cp .env.example .env     # optional - leave blank for local-only mode
npx expo start
```

See `README.md` for the full quickstart and `CLAUDE.md` for the architecture & data-model reference.

## Before you open a PR

```bash
npx tsc --noEmit                      # type-check
npx expo export --platform android    # validate the production bundle compiles
```

A PR should build cleanly (`expo export` succeeds). Keep changes focused; one logical change per PR.

## Project conventions

These are enforced by review (and documented in `CLAUDE.md`):

- **No hardcoded UI strings** - add keys to `locales/en.json` + `locales/hi.json` and use `t('key')`.
- **No direct `expo-sqlite` in components** - all DB access goes through `db/repositories/` (no `db` param).
- **Tenant scoping** via the `getTenantId()` singleton - repositories never take a `tenant_id` argument.
- **Two sync paths** - store data enqueues a Supabase-shaped payload via `addToSyncQueue`; superuser data (tenants/users/auth) writes **directly** to Supabase and surfaces errors.
- **Money** via `lib/money.ts` - never hardcode currency symbols or `toFixed(2)`.
- **Client-side ids** via `lib/id.ts` `newId()` - generated before any write, reused as the Supabase PK.
- **Additive SQLite migrations only** - append a new `if (currentVersion < N)` block in `db/schema.ts`; never rewrite existing migrations (it would lose user data on update).
- **Dark mode** - new UI uses `dark:` variants on neutral surfaces/text/borders.

## Commit & branch style

- Branch from the default branch: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Commit messages: short imperative subject, optionally `area: summary` (e.g. `pos: validate stock before sale`).
- Reference issues with `Fixes #123` where relevant.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security issues, **do not** open a public issue - contact the maintainers privately.

## Secrets

Never commit `.env`, the Supabase **service_role** key, or signing keystores. Only the public `EXPO_PUBLIC_*` anon key belongs in config. By contributing, you agree your contributions are licensed under the project's `LICENSE`.
