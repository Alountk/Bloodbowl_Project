---
name: Bug report
about: Reportá un bug para que lo corrijamos
title: "fix: "
labels: ["bug"]
assignees: ""
---

## Descripción

<!-- Qué pasa y qué esperabas que pasara -->

## Reproducir

1. Pasos:
2. para:
3. reproducir:

## Entorno

- [ ] Local (`pnpm dev`, http://localhost:3000)
- [ ] Producción (Arcane / LAN) — **si marcás esto, verificá que el contenedor use la imagen `latest`**

**Si solo pasa en producción:** probá `docker compose pull web && docker compose up -d --force-recreate web` antes de reportar (muchos bugs "persistentes" son imagen vieja).

## Comportamiento

- Actual:
- Esperado:

## Logs / capturas

<!-- Pegá logs relevantes (dev server, docker logs, consola del browser) -->
