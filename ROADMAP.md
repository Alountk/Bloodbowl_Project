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
| **Partido en vivo** (MVP): página de detalle del partido con los 3 estados (jugado/sin programar/pendiente), resumen del snapshot (marcador, equipos, FF, ganancias, bajas, clima, MVP), acceso "Ver partido" en MatchCard y shells inertes de turno/reloj/eventos listos para el modo en vivo | #57–#60 |
| **Partido en vivo** (modo en tiempo real): modo interactivo 2 entrenadores vía SSE — sincronización de turnos, relojes por equipo (120/240/360s, configurados por liga), marcador y feed cronológico de eventos persistidos desde el día 1 (visible en partidos en vivo Y jugados); reloj servidor-derivado, reversión/restart, grace de 10s, recuperación en nuevo dispositivo, prefill del modal de resultado; opción de reloj en la creación de liga; migración aditiva LiveMatch/LiveEvent | #61–#67 |
| **Partido en vivo** (flujo y permisos): fase de consentimiento (ready → live solo al primer turno), reloj de partido unificado acumulado por lado (info, sin corte por turno; D4 eliminado), matriz de permisos por lado (baja propia del no activo), aviso de "tu turno" + "te piden el turno" con cooldown, **rejornar** (renegociar fecha antes de jugarse), corrección de resultados por ambos capitanes (forfeit sigue admin-only) y **opción de reloj por turno de liga DEPRECADA** (columnas conservadas, sin drop destructivo) | #71–#75 |
| **Partido en vivo** (feed de eventos Design-A): taxonomía ampliada (completion/mvp, sin migración — `LiveEvent.kind` TEXT), feed filtrado por 8 tipos de visualización (turn/turnStart/requestTurn quedan live-only para auditoría), filas Design-A (minuto, T{n}, dorsal, nombre+posición, icono, label, ★, gradiente), banda→etiqueta/★ (Herida/Baja), stats derivadas por equipo, controles de registro de eventos (FAB "+") y escritura de MVP home+away al cargar el resultado | #80–#84 |

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
| Dueño de liga no podía proponer/aceptar fechas si era participante; Jornadas siempre abría en la Jornada 1 aunque estuviera completa; errores de propuesta/aceptación silenciosos | Regla de participante en negociación + jornada activa por defecto + alertas de error (#68) |
| Miembros de una liga STARTED no veían la liga en su lista (no podían aceptar el VS) | Visibilidad de miembro en GET /api/leagues + flag `isMember` y partición en "Mis Ligas" (#69) |

## Pendiente / Roadmap futuro

### Features planificadas
| Feature | Notas |
|---|---|
| **Histórico completo con replay / taxonomía amplia** | El modo en vivo (SSE, turnos, relojes, timeline) ya está en Completado (#61–#67); lo que queda es replay de partidos, taxonomía completa de eventos (intercepciones, skills, clima), filtros y visualización pública — todo explícitamente fuera del alcance de MV-6. |
| **Tabla de posiciones / standings** | La carga de resultados y marcadores ya está implementada; falta calcular y mostrar las standings por jornada. |
| **Notificaciones** (al recibir propuesta de fecha, al iniciar liga, etc.) | Falta decidir canal (in-app, email). |
| **Emblemas reales + dorsal/jersey reales** | Tras el feed Design-A (#80–#84): el dorsal es hoy un pseudo-número por índice de roster; falta asignar números de jersey reales y emblemas de equipo/raza en las filas del feed (follow-ups del cambio). |
| **Auto-cierre del partido en vivo** | Al terminar el partido en vivo, confirmar el cierre automático / flujo de confirmación — pendiente de confirmación de diseño (follow-up del cambio #80–#84). |

### Mejoras técnicas
| Tema | Detalle |
|---|---|
| **Coverage tooling** | No hay `@vitest/coverage` instalado; añadir para gatear ramas. |
| **CI hardening** | El e2e auth sufre cold-start race (primer run puede dar timeout; re-run verde). |
| **Dependabot / renovate** | No configurado aún. |
| **Observabilidad** | No hay logging/errores centralizados (sentry opcional). |
| **QA mobile manual** | La iteración mobile quedó con una tarea de QA manual (375px) pendiente de verificación en dispositivo real. |
| **Refactor `enrichFixture`** | Deuda técnica de live-match (D7): la ruta GET de fixture importa `enrichFixture` desde `app/api/leagues/[id]/route.ts` (cast estructural porque `FixtureWithMatchday` no se exporta). Extraer a `lib/fixtures.ts` y exportar el tipo — refactor no bloqueante, verificado en verify-report. |

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
