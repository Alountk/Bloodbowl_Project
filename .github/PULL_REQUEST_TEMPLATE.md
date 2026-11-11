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

## Definition of Done

- [ ] Issue vinculado y criterios de aceptación cumplidos
- [ ] Evidencia RED→GREEN para cambios de comportamiento
- [ ] Suites + `pnpm lint` + `npx tsc --noEmit` en verde
- [ ] Ayuda/docs actualizados con cambios de comando/opción/mensaje
- [ ] Línea `Risk: …` añadida (`Risk: item N (motivo)` o `Risk: none`)

## Review checklist

<!-- Guía del revisor (Google): un punto por aspecto -->
- [ ] **Design** — ¿El diseño es correcto y encaja con el sistema?
- [ ] **Functionality** — ¿El código hace lo que pretende el autor y lo que necesita el usuario?
- [ ] **Complexity** — ¿Se puede simplificar? ¿Sobra código ahora o pensado para el futuro?
- [ ] **Tests** — ¿Verifican el comportamiento y fallarían si el código se rompe?
- [ ] **Naming** — ¿Los nombres dicen qué son y qué hacen?
- [ ] **Comments** — ¿Los comentarios claros y útiles? ¿Explican el porqué?
- [ ] **Style** — ¿Sigue el estilo del repo y la guía de estilo?
- [ ] **Documentation** — ¿Se actualizaron docs/README cuando cambió algo?

## Notes

<!-- Decisiones de diseño, riesgos, qué NO cubre este PR -->
