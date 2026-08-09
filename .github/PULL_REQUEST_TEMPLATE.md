# Pull Request

## Summary

<!-- 1-3 bullets de qué hace el PR -->

## Changes

| File | Change |
|------|--------|
| `path/to/file` | Qué cambió |

## Test Plan

- [ ] `pnpm test` — (N unit pass)
- [ ] `AUTH_MODE=local pnpm exec playwright test` — (N e2e pass)
- [ ] `pnpm run test:e2e:auth` — (N real-DB pass, si aplica)
- [ ] `pnpm lint` + `npx tsc --noEmit` clean
- [ ] Migración Prisma aplicada (si aplica)

## Notes

<!-- Decisiones de diseño, riesgos, qué NO cubre este PR -->
