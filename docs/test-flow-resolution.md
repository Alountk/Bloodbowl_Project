# Flow de prueba · Resolución de partido en vivo (PR #133)

**Usuarios**: `alountk@gmail.com / CambiaMe2026!` (navegador A) · `testrival@test.local / TestRival2026!` (navegador B / incógnito)

**Estado ya preparado**: el equipo de testrival **"Garras del Alba"** (Amazonas) tiene a **Phedra** con `missNextMatch` → solo **10 disponibles**.

---

## 1 · Preparación (una vez)
1. Login en ambos navegadores.
2. **alountk (A)**: creá una liga nueva ("Liga Flow Test") con un ruleset estándar.
3. **alountk (A)**: asigná **Rookies Test A** a la liga.
4. **testrival (B)**: entrá a la liga (join público) y asigná **Garras del Alba**.
5. **alountk (A)**: **Iniciar temporada** (1 jornada → fixture Rookies A vs Garras del Alba).

## 2 · El partido (ambos lados)
1. Abrí el fixture → **testrival (B)** consiente → debe aparecer el aviso **"Faltan 1 jugador — se añade 1 novato"**.
2. **alountk (A)** consiente → **Comenzar**.
3. **Verificar turnos** (bug corregido): alountk juega **Turno 1** → pasa → **testrival juega Turno 1** (MISMO número, no "Turno 2"). El número avanza recién cuando vuelve el que empezó.
4. **Registrar un blitz con herida** (el jugador activo):
   - "+" → Herida → causador + víctima → causa **Blitz/Bloqueo** → tirada 1D16 **13–14** (permanente) o **9** (apaleado).
   - **Verificar ★**: la card del **autor** (blitz/bloqueo) muestra **★2**; la card de la **víctima** NO muestra puntos.
5. **Terminar el partido** (EndMatch cuando quieras).

## 3 · Resolución (el flujo nuevo)
1. **MVP — checkboxes**: cada entrenador marca con **checkboxes** hasta **6 jugadores de SU equipo** (el 7º se deshabilita; no se pueden elegir novatos ni no disponibles) → **Enviar** → el rival ve "nominó 6" sin ver tus picks (aparece solo, sin recargar).
2. Cuando ambos están listos → **"¿Estás seguro?"** → **Sí, tirar el MVP** → salen los MVP por equipo (**ya no se puede volver atrás**).
3. **Resumen**: ganancias por equipo · **Factor fan: ↑ / = / ↓ (tirada N)** (reglamento: win → 1D6 ≥ Hinchas → +1 máx 7; loss → 1D6 < Hinchas → −1 mín 1; draw → igual) · PE.
4. **Guardar y reportar** → "Partido reportado".
5. **Fichaje (último paso)**: testrival ve su **novato** → checkbox → **"Contratar marcados"**.
   - **Verificar cobro único**: tesorería **−50k** (una vez), roster **+1** (el novato con su nombre), balance **−50k** (no −100k).

## 4 · Checklist final
- [ ] Turnos: A T1 → B T1 → A T2 → B T2 (no A T1 → B T2)
- [ ] Herida: ★2 solo en la card del autor (víctima sin ★)
- [ ] MVP: checkboxes, máx 6, envío al rival, confirmación final, sin volver atrás
- [ ] Factor fan: tirada visible y aplicada (↑/=/↓)
- [ ] Fichaje: tesorería −50k una sola vez + novato en el roster
