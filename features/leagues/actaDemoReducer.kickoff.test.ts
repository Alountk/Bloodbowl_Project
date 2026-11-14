import { beforeEach, describe, expect, it, vi } from "vitest";

import { kickoffEventFor } from "@/lib/rules/kickoffEvents";
import { weatherFromRoll } from "@/lib/rules/weather";

import {
  actaDemoReducer,
  demoState,
  kickoffDuelLine,
  kickoffRegisterLine,
  type ActaDemoState,
} from "./actaDemoReducer";

/**
 * S3 · T4 — the kickoff slice («Kickoff con efectos 2D6», design C «Acta
 * secuencial»): `rollKickoff` throws the 2D6 (two `rollD6()` from
 * `@/lib/random`), `rollKickoffDuel` records one 1D6 per side on the opposed
 * follow-up (6/7/11/12) and `registerKickoff` stamps the sequential acta rows
 * (`kind: "kickoff"`, demo-only — the production server never emits it, MVT-6).
 * Presets/hydrated saves read `registered: true` («every scenario starts past
 * kickoff», S1) while the fresh-match reset («Restablecer») opens the gate.
 */

const dice = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock("@/lib/random", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/random")>();
  return {
    ...actual,
    rollD6: () => dice.queue.shift() ?? 3,
  };
});

beforeEach(() => {
  dice.queue = [];
});

/** The fresh-match base (Restablecer): kickoff NOT registered yet. */
function fresh(): ActaDemoState {
  return actaDemoReducer(demoState("inicio"), {
    type: "reset",
    scenario: "inicio",
  });
}

function roll(from: ActaDemoState, queue: number[]): ActaDemoState {
  dice.queue = [...queue];
  return actaDemoReducer(from, { type: "rollKickoff" });
}

function duel(
  from: ActaDemoState,
  side: "home" | "away",
  die: number,
): ActaDemoState {
  dice.queue = [die];
  return actaDemoReducer(from, { type: "rollKickoffDuel", side });
}

function register(from: ActaDemoState, queue: number[] = []): ActaDemoState {
  dice.queue = [...queue];
  return actaDemoReducer(from, { type: "registerKickoff" });
}

describe("the kickoff slice — defaults (presets / fresh reset / hydrate)", () => {
  it("every scenario preset starts PAST kickoff (registered, no dice)", () => {
    for (const scenario of [
      "inicio",
      "primer-tercio",
      "segundo-tercio",
      "finalizado",
    ] as const) {
      expect(demoState(scenario).kickoff).toEqual({
        d1: null,
        d2: null,
        registered: true,
        followUp: null,
      });
    }
  });

  it("reset(inicio) = a FRESH match: the kickoff gate is NOT registered", () => {
    expect(fresh().kickoff).toEqual({
      d1: null,
      d2: null,
      registered: false,
      followUp: null,
    });
  });

  it("hydrate: old saves without the slice read as registered; saved progress is kept", () => {
    const oldSave = { ...demoState("segundo-tercio") };
    delete (oldSave as Partial<ActaDemoState>).kickoff;
    const fromOld = actaDemoReducer(fresh(), {
      type: "hydrate",
      saved: oldSave,
    });
    expect(fromOld.kickoff.registered).toBe(true);

    const saved = {
      ...demoState("inicio"),
      kickoff: {
        d1: 1,
        d2: 5,
        registered: false,
        followUp: { home: 4, away: null },
      },
    };
    const fromNew = actaDemoReducer(fresh(), { type: "hydrate", saved });
    expect(fromNew.kickoff).toEqual(saved.kickoff);
  });
});

describe("rollKickoff — the 2D6 event roll (locked after one throw)", () => {
  it("records both dice and resolves the table face", () => {
    const next = roll(fresh(), [3, 5]);
    expect(next.kickoff.d1).toBe(3);
    expect(next.kickoff.d2).toBe(5);
    // 8 = CLIMA CAMBIANTE (weather) — no opposed follow-up.
    expect(next.kickoff.followUp).toBeNull();
  });

  it("opens the opposed follow-up slots on 6/7/11/12 faces", () => {
    const next = roll(fresh(), [1, 5]);
    expect(next.kickoff.followUp).toEqual({ home: null, away: null });
  });

  it("never re-rolls a recorded pair", () => {
    const first = roll(fresh(), [2, 2]);
    const second = roll(first, [6, 6]);
    expect(second.kickoff.d1).toBe(2);
    expect(second.kickoff.d2).toBe(2);
    expect(second).toBe(first);
  });

  it("is a no-op once the gate is registered", () => {
    const done = register(roll(fresh(), [2, 2]));
    const next = roll(done, [6, 6]);
    expect(next).toBe(done);
  });
});

describe("rollKickoffDuel — the opposed follow-up (one 1D6 per side)", () => {
  it("fills each side once and keeps the other's die", () => {
    let next = roll(fresh(), [1, 5]);
    next = duel(next, "home", 6);
    expect(next.kickoff.followUp).toEqual({ home: 6, away: null });
    next = duel(next, "home", 2);
    expect(next.kickoff.followUp).toEqual({ home: 6, away: null });
    next = duel(next, "away", 3);
    expect(next.kickoff.followUp).toEqual({ home: 6, away: 3 });
  });

  it("is a no-op on non-opposed faces (no follow-up slots)", () => {
    const weather = roll(fresh(), [3, 5]);
    const next = duel(weather, "home", 6);
    expect(next).toBe(weather);
    expect(next.kickoff.followUp).toBeNull();
  });
});

describe("registerKickoff — the sequential acta rows (kind: \"kickoff\")", () => {
  it("needs the 2D6 roll before registering", () => {
    const base = fresh();
    expect(register(base)).toBe(base);
  });

  it("manual face: stamps roll → event → award rows and locks the gate", () => {
    const next = register(roll(fresh(), [1, 1]), [4, 4]);
    const rows = next.events.filter((e) => e.kind === "kickoff");
    expect(rows.map((e) => e.payload.phase)).toEqual(["roll", "event", "award"]);
    expect(rows[0].payload).toMatchObject({
      phase: "roll",
      d1: 1,
      d2: 1,
      sum: 2,
      eventId: "arbitro-intimidado",
      note: "Kickoff · 2D6: 1 + 1 = 2",
    });
    expect(rows[1].payload).toMatchObject({
      phase: "event",
      sum: 2,
      eventId: "arbitro-intimidado",
      note: "Kickoff · ÁRBITRO INTIMIDADO",
    });
    expect(rows[2].payload).toMatchObject({
      phase: "award",
      note: "Kickoff · ÁRBITRO INTIMIDADO → Aplicación manual en la demo",
    });
    expect(next.kickoff.registered).toBe(true);
    // Locked: a second registration adds nothing.
    expect(register(next)).toBe(next);
  });

  it("opposed face: stamps the duel row with both dice and the tie-rule line", () => {
    let next = roll(fresh(), [2, 4]);
    next = duel(next, "home", 5);
    next = duel(next, "away", 3);
    next = register(next);
    const rows = next.events.filter((e) => e.kind === "kickoff");
    expect(rows.map((e) => e.payload.phase)).toEqual([
      "roll",
      "event",
      "duel",
      "award",
    ]);
    expect(rows[2].payload).toMatchObject({
      phase: "duel",
      home: 5,
      away: 3,
      note: "Kickoff · Duelo 1D6: 5 vs 3 → gana Águilas de Khemri",
    });
    expect(rows[3].payload).toMatchObject({
      phase: "award",
      note: "Kickoff · LOS HINCHAS ANIMAN → beneficio para Águilas de Khemri (5 vs 3)",
    });
  });

  it("weather face (8): the award points at a NEW weather roll through the existing machinery", () => {
    const next = register(roll(fresh(), [3, 5]), [2, 6]);
    const roll8 = 2 + 6;
    const kinds = next.events.map((e) => e.kind);
    // roll → event → NEW weather roll (existing machinery) → award registro.
    expect(kinds.slice(-4)).toEqual(["kickoff", "kickoff", "weather", "kickoff"]);
    const weather = next.events.filter((e) => e.kind === "weather")[0];
    expect(weather.payload).toEqual({
      value: weatherFromRoll(roll8).kind,
      roll: roll8,
    });
    const award = next.events.filter((e) => e.kind === "kickoff")[2];
    expect(award.payload.note).toBe("Kickoff · CLIMA CAMBIANTE → nueva tirada de Clima");
  });

  it("the rows are stamped like every demo event (seq monotonic, half/turn copied)", () => {
    const before = roll(fresh(), [1, 1]);
    const next = register(before);
    const rows = next.events.filter((e) => e.kind === "kickoff");
    expect(rows.map((e) => e.seq)).toEqual([
      before.nextSeq,
      before.nextSeq + 1,
      before.nextSeq + 2,
    ]);
    expect(rows.every((e) => e.half === 1 && e.turnNumber === 1)).toBe(true);
    expect(next.nextSeq).toBe(before.nextSeq + 3);
  });
});

describe("kickoffDuelLine / kickoffRegisterLine — the acta copy (shared with the gate)", () => {
  const names = { home: "Águilas de Khemri", away: "Colmillos del Caos" };

  it("duel line names the winner, the tie rule per event text, or the manual gap", () => {
    const animan = kickoffEventFor(1, 5);
    const indigestion = kickoffEventFor(5, 6);
    expect(
      kickoffDuelLine(animan, { home: 5, away: 3 }, names),
    ).toBe("Kickoff · Duelo 1D6: 5 vs 3 → gana Águilas de Khemri");
    expect(kickoffDuelLine(animan, { home: 4, away: 4 }, names)).toBe(
      "Kickoff · Duelo 1D6: 4 vs 4 → empate: ambos ganan el beneficio",
    );
    expect(kickoffDuelLine(indigestion, { home: 2, away: 6 }, names)).toBe(
      "Kickoff · Duelo 1D6: 2 vs 6 → afecta a Águilas de Khemri",
    );
    expect(kickoffDuelLine(indigestion, { home: 1, away: 1 }, names)).toBe(
      "Kickoff · Duelo 1D6: 1 vs 1 → empate: ambos sufren el efecto",
    );
    expect(kickoffDuelLine(animan, { home: 5, away: null }, names)).toBe(
      "Kickoff · Duelo 1D6: 5 vs — → sin resolver (manual)",
    );
  });

  it("register line is the «Kickoff · <evento> → …» registro row", () => {
    const manual = kickoffEventFor(2, 2);
    const weather = kickoffEventFor(3, 5);
    const opposed = kickoffEventFor(1, 5);
    expect(kickoffRegisterLine(manual, null, names)).toBe(
      "Kickoff · DEFENSA SÓLIDA → Aplicación manual en la demo",
    );
    expect(kickoffRegisterLine(weather, null, names)).toBe(
      "Kickoff · CLIMA CAMBIANTE → nueva tirada de Clima",
    );
    expect(kickoffRegisterLine(opposed, { home: 2, away: 4 }, names)).toBe(
      "Kickoff · LOS HINCHAS ANIMAN → beneficio para Colmillos del Caos (2 vs 4)",
    );
    expect(kickoffRegisterLine(opposed, { home: 3, away: 3 }, names)).toBe(
      "Kickoff · LOS HINCHAS ANIMAN → empate: ambos ganan el beneficio (3 vs 3)",
    );
    expect(kickoffRegisterLine(opposed, null, names)).toBe(
      "Kickoff · LOS HINCHAS ANIMAN → duelo sin resolver (manual)",
    );
  });
});
