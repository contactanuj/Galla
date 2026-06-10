<!-- Thanks for contributing to Galla! -->

## Summary

<!-- What does this PR change and why? -->

## Related issues

<!-- e.g. Fixes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / chore
- [ ] Documentation

## Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npx expo export --platform android` succeeds
- [ ] New UI strings added to `locales/en.json` **and** `locales/hi.json` (via `t('key')`)
- [ ] DB access goes through `db/repositories/` (no direct `expo-sqlite` in UI)
- [ ] New SQLite schema changes are an **additive** migration in `db/schema.ts`
- [ ] New UI has `dark:` variants
- [ ] No secrets committed (`.env`, service_role key, keystores)
