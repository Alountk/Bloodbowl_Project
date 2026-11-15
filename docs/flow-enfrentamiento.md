# Flujo del enfrentamiento — mapa de verificación

Diagrama del flujo real de `/demo/partido` (dirección A: captura única en vivo, acta derivada),
contrastado con el código y los tests. Para verificar que lo implementado coincide con lo esperado.

```mermaid
flowchart TD
    START(["/demo/partido"]) --> Q1{"¿Partido iniciado?"}

    Q1 -- No --> WZ["Wizard «Antes del partido» · 4 pasos<br/>1 Los Hinchas · 2 El Clima · 3 Incentivos · 4 Equipo pateador<br/>(un paso por cada entrenador, solo adelante)"]
    WZ --> FIN_SIDE["Cada entrenador: «Finalizar»<br/>→ «Esperando al contrincante…»"]
    FIN_SIDE --> TOSS{"«¿Quién recibe?»<br/>gana la moneda → elige<br/>(el receptor se queda con el balón / ataca)"}

    TOSS --> KICK["Kickoff OMITIDO del flujo<br/>la patada inicial se resuelve EXTERNAMENTE<br/>(sin gate, sin eventos de kickoff)"]
    KICK --> T1(["Partido arranca · TURNO 1<br/>activo = el RECEPTOR"])

    T1 --> DOCK["Dock de captura real<br/>«+ TD · + Pase · + Baja · + Evento · Fin Turno»"]
    DOCK --> CARD["Cada captura → fila en la CARD del half-turn<br/>del equipo que actúa (chip EN JUEGO)<br/>Baja causada → card del CAUSANTE, nunca de la víctima"]
    CARD --> FINT{"¿«Fin Turno»?"}
    FINT -- "aún no" --> DOCK
    FINT -- Sí --> REASON["Razón: Voluntario / Tirada fallida / Baja"]
    REASON --> PAIR{"¿Cerró la PARJA?<br/>(ambos equipos jugaron el turno N)"}

    PAIR -- "No — falta el rival" --> RIVAL["Turno N del RIVAL · su card EN JUEGO"]
    RIVAL --> DOCK
    PAIR -- "Sí — pareja cerrada" --> NEXT["Turno N+1<br/>el número SOLO avanza al cerrar la pareja<br/>al cambiar de mitad cambia quién abre"]
    NEXT --> DOCK

    NEXT --> END{"¿Mitad 2 · turno 8 cerrado?"}
    END -- No --> DOCK
    END -- Sí --> FIN(["Partido finalizado"])

    FIN --> CLOSE["Cierre → acta derivada (S5)"]
```

## Reglas de las cards (por half-turn)

| Situación | Resultado |
|---|---|
| Turno activo | Card siempre visible, chip **EN JUEGO**, acciones aparecen al registrarse |
| Half-turn cerrado **sin** registros | La card **no se renderiza** (desaparece) |
| Half-turn cerrado **con** registros | Card permanece: segunda en jugar = COMPLETADO, la que abrió = CERRADO |
| Evento de sistema (neutro) | Card «AMBOS EQUIPOS» |
| Baja causada | Card del **causante** (el DTO lleva el lado de la víctima; el acta la atribuye al causante) |

## Dados (motor `lib/random.ts`, PR #404)

- `rollD16` = **1D16 uniforme** para la tabla de lesiones (tirada real de mesa) · `rollD3` = d6/2 · `roll2D6` = **suma** de dos d6 (triangular) · semilla `createRng(seed)` **solo para tests**.

## Qué verifica cada test de flujo

| Tramo del diagrama | Test |
|---|---|
| Wizard → quién recibe → T1 (sin kickoff) | `actaDemoHarness.test.tsx` · happy path + describe T9 |
| Pair rule T1r → T1o → T2 | `actaDemoHarness.test.tsx` · T10 (test 1) |
| Half-turn vacío → sin card | T10 (test 2) · `actaTurnTimeline.test.tsx` |
| Recarga a mitad (F5) | T10 (test 3) · T13 (mid-wizard del 2.º entrenador) |
| Capturas → cards (causante) | T11 (tests 1-4) |
| Cierre (S5) | solo reducer unit — **pendiente de flow test** |

## Backlog conocido

- Heridas al placar con **«ambos derribados»**: definir cómo se registra (pendiente de S4 Combate).
