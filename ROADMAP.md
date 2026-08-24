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
| Catálogo BB2025 = **31 razas / 163 posicionales** (Slann añadido), alineado con **rulebook** (composición, letras de acceso, skills BB2025 completas, nombres ES); el catálogo vive en JSON con validador y scraper rulebook como fuente | #106, #107, directos a main |
| **Nombres fantásticos** por raza: bancos de jugadores ("Nombre Apellido") y nombres de equipo, dado 🎲 en la creación y re-roll en el renombrado | #106, directos a main |
| **Roster estilo rulebook**: tabla densa con progresión integrada (barra SPP segmentada, NI, skills con marcador de compra), modal de improve con selects filtrados por PE, renombrar jugadores, dorsal junto al puesto y stats de carrera (CAS/MVP) | directos a main |
| **Contratar/despedir** contra el balance real de tesorería + **reordenar la plantilla** con flechas (el dorsal del feed sigue el orden) | #110, #111 |
| **Bajas que se pierden el próximo partido** ("Baja la próxima", suspensión RAU-12; el hematoma nunca bloquea) | #108 |
| **Página `/teams`**: secciones "Sin liga" / "En liga", cards con CTV, tesorería y hint "listos para mejorar" (cuenta PE disponibles), guard 409 al archivar | #121, #125–#127 |
| **Página `/matches`**: próximos partidos agrupados por fecha con badge **EN VIVO** (card link al partido) | #128–#132 |

### Cuenta y datos
| Feature | PR / Cambio |
|---|---|
| Auth.js v5 (email+contraseña, JWT), login/signup/logout, rutas protegidas | #22, #23, #25, #26 |
| PostgreSQL + Prisma, migraciones automáticas en deploy | #22 |
| Migración de localStorage → cuenta (idempotente) | #26, fixes directos |
| Avatares de usuario + página "My Profile" (avatar 256×256 WebP, /profile, nav, owner avatar en MatchCard) | #44, #45, #46, #47 |
| **Modelo de cuentas con roles**: `user` / `developer` (el rol desbloquea la sección dev de rulesets; guard 403 server-side, DB-authoritative) | #112 |
| **Landing pública + dashboard**: `/` = landing para anónimos / dashboard para logueados; **nav unificado** (Teams · Leagues · Matches) | #117, #118 |
| **Auth en modal** (bottom/top-sheet mobile; /login y /signup pasan a ser fallbacks), coach name obligatorio | #118 |
| **My Profile ampliado**: cambio de contraseña y **estadísticas de carrera** (campeonatos, V/E/D) derivadas de los equipos del usuario | #119 |
| **Idioma por cuenta** (ES/EN): selector en My Profile, herencia en el signup, precedencia SSR (cuenta > cookie `bb-locale` > navegador) | #120 |
| **Storage**: localStorage deprecado para equipos (modo local en memoria compartida) y para el locale (cookie); la migración legacy a cuenta se conserva | #118, #120 |

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
| **Partido en vivo** (eventos de kickoff): Error costoso (matriz 6×6 del reglamento por tramo de tesorería, descuento atómico server-side con clamp anti-negativo) y Factor de aficionados (1D3 vía D6 + dedicated fans) como kinds TEXT sin migración, filas a 0' antes del primer turno, dados 100% server-side, begin idempotente (retry → 409) | #100–#102 |
| **Concesión** (RAU-38): controles en la zona de turno del header, card en el feed, persistencia + victoria en la misma transacción, winnings del walkover sobre el marcador real | #104 |
| **Bajas en dos fases** (RAU-34/LM-12): causa + víctima por el coach activo, panel de confirmación del defensor y **action card derivada** solo en el lado del causador | #105, #103 |
| **Diseño match view rulebook v7 restaurado/validado** (header sticky 3 filas, timeline, cards de eventos con iconos SVG) y arranque de partido sin fecha acordada | #103 |
| **Cierre de liga + campeón** (RAU-40): standings **3/1/0** con desempates (puntos → diff. TD → TDs a favor → enfrentamiento directo → id), cierre atómico al completar la última jornada (hook en result/forfeit/concede), badge **"Finalizada"** + **panel del campeón** | directos a main |
| **Ganancias al terminar el partido en vivo** (RAU-44): winnings deterministas por equipo persistidos en el cierre y expuestos en el resumen (sin refresco) | directos a main |
| **Resolución del partido para partidos en vivo finalizados** (RAU-48/49): modal guiado con MVP y FF con previsualización confirmada | directos a main |
| **i18n ES/EN** (cero dependencias): núcleo con diccionarios, migración de shell, auth, wizard, detalle, ligas y match view; idioma por cuenta | directos a main + #120 |
| **i18n SSR + default inglés**: el layout resuelve el locale con precedencia cuenta > sesión > cookie > `Accept-Language` > **inglés** (mata el hydration mismatch del landing anónimo); **landing localizado** (hero, features, how-it-works, footer — ya no hardcodeado) | #141, #142 |
| **MVP por lado** (RAU-51): nominación de MVP en el modal de resolución con comando server-side, rollo y gating | #109 |
| **Tipos de reglas (rulesets)** (RAU-52/52b): modelo `Ruleset` + `League.rulesetId` + `User.role` con seed "Estándar BB2025"; CRUD dev-only con guard 403; las ligas eligen un ruleset al crearse (badge en cards/detalle); sección dev con wizard de cards/tabs (razas, tesorería, TV cap, mín/máx, gestión) y editor inline con guard de cambios sin guardar | #111, #112, #113 |
| **Un usuario = un equipo por liga** (RAU-54): segundo join → 409; auditoría de auth (401 sin sesión, redirect de página) | #115 |
| **Novatos / Journeymen** (RAU-13/14): si hay menos de 11 disponibles, novatos del banco de la raza (nombres deterministas por partido); ganan PE, elegibles a MVP, evento "novato se une" y **fichaje post-resolución** (Contratar con cobro único / Dejar ir) | #116, #115 |
| **Resolución por lado** (wizard de 5 pasos, resumible): ganancias → aficionados (↑/=/↓, dado 1D6 server-side sobre dedicated fans) → MVP (checkboxes, máx. 6) → bajas → novatos; card persistente "Informar del fin del partido" con el paso actual; **cuando ambos lados terminan, el partido se cierra solo** | #133, #134 |
| **Turnos correctos** (home T1 → away T1 → home T2) y **★2 solo en el causador** (RAU-47), también en el card de lesión | #133 |
| **Tabla de posiciones (standings UI)** (RAU-40): la tabla 3/1/0 con la cadena de desempates aprobada (puntos → diff TD → TDs a favor → head-to-head → id) ahora se muestra en el detalle de liga sobre las jornadas, con la fila del campeón en dorado; usa el MISMO `computeStandings` puro que decide el campeón server-side | #144 |

### Calidad y mantenimiento
| Tema | PR / Cambio |
|---|---|
| Limpieza de referencias al servicio externo (38 archivos: docs, código, tests, i18n, archive; terminología neutral/rulebook) | #137 |
| Suite e2e auth paralelizada: bcrypt cost 4 en tests + 2 proyectos Playwright (chromium paralelo + sse-heavy serial) — 9:18 → 5:06 | #138 |

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
| Doble submit de comandos en vivo ("Dar el turno" dos veces) | In-flight lock por comando (#78) |
| Contadores de turno por equipo mezclados | Aislamiento de contadores por lado en la top bar live (#79) |
| SSE entregaba frames corruptos / hub duplicado por instancia | Hub compartido process-wide + snapshot con gap-replay (#77, #78) |
| Match view degradado vs. el mockup validado | Restauración y lock del diseño rulebook v7 (#103) |
| Causas de baja duplicadas en el feed; ★ de la herida en ambos cards | Consolidación de causas + SPP/★ solo en el card del causador (directos + #133) |
| El turno no avanzaba al empezar una nueva ronda | Avance solo cuando vuelve el starter (home T1 → away T1 → home T2) (#133) |
| El fichaje de un novato cobraba el coste dos veces | Flag `hired` que evita el recuento de balance (#133) |
| Mezcla de idiomas (sesión vs cookie) en la navegación | Locale solo por cookie/cuenta + precedencia SSR (#118, #120) |
| Keys duplicadas de React por víctimas de lesión repetidas en la resolución en vivo | Dedup de `casualtyVictimsFromEvents` por (equipo, jugador) con la banda más severa (#139) |
| Flaky del locator de live-match (filter ambiguo → strict violation cuando el SSE era rápido) | Locator por víctima + línea del causante, resuelve a una sola card (#140) |

## Pendiente / Roadmap futuro

### Features planificadas
| Feature | Notas |
|---|---|
| **Histórico completo con replay / taxonomía amplia** | El modo en vivo (SSE, turnos, relojes, timeline), kickoff (#100–#102) y la resolución por lado (#133/#134) ya están en Completado; lo que queda es replay de partidos, taxonomía completa de eventos (intercepciones, skills, clima, resto de la tabla de kickoff), filtros y visualización pública. |
| **Crear equipo al apuntarse a una liga** | Hoy hay que crear el equipo antes y unirse con él; falta poder crear el equipo desde la inscripción con el **ruleset de la liga aplicado** (razas permitidas, tesorería, mín/máx). |
| **Historial en My Profile** | El perfil muestra estadísticas de carrera (RAU-57); falta el historial de temporadas y equipos pasados. |
| **Notificaciones** (al recibir propuesta de fecha, al iniciar liga, etc.) | Falta decidir canal (in-app, email). |
| **Emblemas reales + dorsal/jersey reales** | El dorsal es hoy un pseudo-número por índice de roster; falta asignar números de jersey reales y emblemas de equipo/raza. |
| **Jugadores prestados fuera de novatos** | Los Journeymen cubren el mínimo (RAU-13/14); falta el préstamo temporal de jugadores de otros equipos. |

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

**Gestión de plantilla**
- Dorsal/jersey reales asignables y emblemas de equipo (hoy pseudo-dorsal por índice).
- Drag & drop para reordenar (las flechas ya existen, #110).
- Jugadores prestados fuera de novatos: si en liga no llegas al mínimo y no alcanzan los novatos.
- Exportar plantilla a hoja de reglamento (PDF/imagen).

**En la mesa (partido)**
- Reloj a pantalla completa / semáforo de turno.
- Log de dados persistente por partido.
- Modo delegado: un tercero opera turnos/reloj desde el link view-only (amplía RAU-7).

**Liga y competición**
- Partidos amistosos fuera de liga.
- Múltiples ligas por equipo (hoy una por equipo).
- Invitaciones por enlace para ligas privadas.
- Play-offs / bracket tras la liga regular.
- Estadísticas por temporada (TDs, bajas, SPP acumulado) además de la carrera del perfil.
- Sanciones de liga (suspensión por N partidos).
- Incentivos por equipo (chips) — RAU-5.
- Historial de equipos por usuario (temporadas anteriores) en My Profile.

**Contenido y rejugabilidad**
- Generador de equipos aleatorio / draft.
- Guía de reglas integrada (búsqueda de skill/regla).

**Plataforma y venta**
- Compartir partido en vivo por link (webcam/móvil/segunda pantalla) — RAU-7.
- Páginas públicas de liga (resultados/standings sin cuenta).
- PWA instalable.
- Import/export de equipos JSON.
- Planes de pago / roles admin (el modelo `User.role` ya está preparado para extenderlos).

---

## Notas de deploy

- Cada merge a `main` reconstruye y publica la imagen en GHCR (GitHub Actions); los tags llevan fecha legible y un workflow semanal limpia las 10 imágenes más antiguas.
- Las migraciones de Prisma se aplican solas en el contenedor (`prisma migrate deploy`).
- En Arcane: mantener el contenedor al día con `docker compose pull web && docker compose up -d --force-recreate web` (los bugs "ya corregidos" que persisten suelen ser imagen vieja).
