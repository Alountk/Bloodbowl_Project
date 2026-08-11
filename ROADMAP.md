# Roadmap

Histórico de lo implementado, bugs resueltos y trabajo pendiente. Cada entrada en **Completado** referencia su PR.

## Completado

### Equipos y UI
| Feature | PR / Cambio |
|---|---|
| Catálogo BB2025 (30 razas, 144 posicionales, skills ES, acceso G/A/P/S/M/F) | #1–#9 |
| Creación de equipos: wizard 2 pasos, mínimo 11 jugadores, presupuesto, coaching staff | #16, #21 (cerrado), fixes directos |
| Detalle de equipo estilo libro (plantilla, cuerpo técnico, tesorería) | #13, #15 |
| Home con cards, búsqueda, archivo (soft delete) con modal | #17, #28 |
| Diseño "rulebook light" en toda la app (shell, sidebar, tablas) | #17, #20 |
| Responsive mobile (drawer, tablas apiladas, combos nativos, sin scroll horizontal) | #19, #20, fixes directos |

### Cuenta y datos
| Feature | PR / Cambio |
|---|---|
| Auth.js v5 (email+contraseña, JWT), login/signup/logout, rutas protegidas | #22, #23, #25, #26 |
| PostgreSQL + Prisma, migraciones automáticas en deploy | #22 |
| Migración de localStorage → cuenta (idempotente) | #26, fixes directos |
| Avatares de usuario + página "My Profile" (avatar 256×256 WebP, /profile, nav, owner avatar en MatchCard) | #44, #45, #46, #47 |

### Ligas y campeonatos
| Feature | PR / Cambio |
|---|---|
| Ligas como agrupación (CRUD, una liga por equipo, unirse, expulsar, guard 409) | #29, #32, #33 |
| Campeonatos: jornadas automáticas (round-robin sin repetir, equipos impares) | #34, #37, #38 |
| Matchday: negociación de fechas (toma y daca), forfeit del admin, scouting, completitud de jornada | #39, #42, #43 |
| Match report: carga y corrección de resultados (marcador, ganador derivado, tesorería, FF, PE, lesiones, bote), progresión de jugadores (PE → mejoras, skill élite, recalculo de valor) y e2e de los flujos completos | #49–#54 |

### Bugs resueltos
| Bug | Fix |
|---|---|
| `crypto.randomUUID is not a function` por IP LAN (secure-context) | `createId()` con fallback (#9) |
| 403 en chunks por acceso LAN (Next 16 `allowedDevOrigins`) | `next.config.ts` |
| Scroll horizontal en mobile (min-width 640 en tablas) | Wrappers solo desktop + filas apiladas |
| Logout redirigía a `0.0.0.0:3444/login` (host del servidor) | Redirect client-side con `router.push` |
| Login no accedía a equipos/ligas sin refrescar | Navegación con `router.push + refresh` (la causa en prod era imagen vieja en Arcane) |
| Se podía crear equipos con < 11 jugadores (backend) | Validación server-side `MIN_PLAYERS=11` |
| Migración localStorage duplicaba equipos (StrictMode) | Flag de módulo + dedupe por nombre |
| Equipo archivado se podía inscribir en una liga | Guard 409 en assign + tests de regresión |

## Pendiente / Roadmap futuro

### Features planificadas
| Feature | Notas |
|---|---|
| **Partido en vivo** (interacción entre dos clientes) | La feature más grande: sincronización en tiempo real, marcador, turnos. Requiere WebSockets/SSE o similar. |
| **Tabla de posiciones / standings** | La carga de resultados y marcadores ya está implementada; falta calcular y mostrar las standings por jornada. |
| **Notificaciones** (al recibir propuesta de fecha, al iniciar liga, etc.) | Falta decidir canal (in-app, email). |

### Mejoras técnicas
| Tema | Detalle |
|---|---|
| **Coverage tooling** | No hay `@vitest/coverage` instalado; añadir para gatear ramas. |
| **CI hardening** | El e2e auth sufre cold-start race (primer run puede dar timeout; re-run verde). |
| **Dependabot / renovate** | No configurado aún. |
| **Observabilidad** | No hay logging/errores centralizados (sentry opcional). |
| **QA mobile manual** | La iteración mobile quedó con una tarea de QA manual (375px) pendiente de verificación en dispositivo real. |

### Backlog de producto (ideas)
- Partidos amistosos fuera de liga.
- Historial de equipos por usuario (temporadas anteriores).
- Exportar equipo a hoja de plantilla (PDF/imagen).
- Múltiples ligas por equipo (hoy es una por equipo).
- Invitaciones por enlace para ligas privadas.

---

## Notas de deploy

- Cada merge a `main` reconstruye y publica la imagen en GHCR (GitHub Actions).
- Las migraciones de Prisma se aplican solas en el contenedor (`prisma migrate deploy`).
- En Arcane: mantener el contenedor al día con `docker compose pull web && docker compose up -d --force-recreate web` (los bugs "ya corregidos" que persisten suelen ser imagen vieja).
