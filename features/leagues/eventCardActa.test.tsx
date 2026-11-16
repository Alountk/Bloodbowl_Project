import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveEventCardsActa } from "./eventCardActa";
import type { MatchTeamDetail, LiveMatchEventDto } from "./api";

/**
 * The production chronology renderer (MatchView.tsx / WatchMatchView.tsx) —
 * LM-13 acta-vocabulary cards (verifier defect 1, Slice E). A recorded
 * interception / throw-team-mate / landed-safe MUST render like any player
 * event: player name + dorsal, the ★SPP stars and the ack row. Rendering via
 * the unknown-kind fallback (label + turn meta only) silently killed the
 * cotejo surface and refuted the "rival verifies them the same way" claim.
 */

function player(id: string, name: string, positionalKey = "blitzer", valueBonus = 0) {
  return {
    rosterPlayerId: id,
    name,
    positionalKey,
    pe: 0,
    skills: {},
    injuries: {},
    alive: true,
    missNextMatch: false,
    valueBonus,
  };
}

const homeTeam: MatchTeamDetail = {
  id: "team-home",
  name: "Reavers",
  raceId: "human",
  user: { id: "u1", name: "Coach A", email: null },
  players: [player("p1", "Blitzer A"), player("p4", "Arnau", "thrower")],
};

const awayTeam: MatchTeamDetail = {
  id: "team-away",
  name: "Dwarves",
  raceId: "dwarf",
  user: { id: "u2", name: "Coach B", email: null },
  players: [player("p2", "Blitzer B")],
};

function ev(
  overrides: Partial<LiveMatchEventDto> & Pick<LiveMatchEventDto, "kind">,
): LiveMatchEventDto {
  return {
    seq: 1,
    side: "home",
    playerRosterId: "p1",
    half: 1,
    turnNumber: 3,
    payload: {},
    at: 1000,
    ...overrides,
  };
}

function renderActa(events: LiveMatchEventDto[], now = 2000) {
  return render(
    <LiveEventCardsActa
      events={events}
      startedAt={900}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      now={now}
    />,
  );
}

describe("LiveEventCardsActa — LM-13 scored kinds render like any player card (verifier defect 1)", () => {
  const kinds = [
    { kind: "interception", label: "Intercepción", stars: "★2" },
    { kind: "throwTeamMate", label: "Lanzar compañero", stars: "★1" },
    { kind: "landedSafe", label: "Aterrizar sano", stars: "★1" },
  ] as const;

  it.each(kinds)(
    "$kind renders player + dorsal + ★SPP + the ack row (like the completion beside it)",
    ({ kind, label, stars }) => {
      const { container } = renderActa([
        ev({ kind, side: "home", playerRosterId: "p1", seq: 2 }),
        // The verifier's comparison card: a completion renders player + ★1 + ack.
        ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
      ]);
      const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
      expect(rows).toHaveLength(2);
      const row = rows[0] as HTMLElement; // newest first → the new kind
      expect(row.textContent).toContain(label);
      // Player + dorsal (the unknown-kind fallback renders NEITHER).
      expect(row.textContent).toContain("Blitzer A");
      expect(row.textContent).toContain("#1");
      // ★SPP stars for the kind's bb2025 award.
      expect(row.textContent).toContain(stars);
      // The ack row renders on BOTH cards (the cotejo surface the fallback lost).
      expect(screen.getAllByText(/Sin cotejar/)).toHaveLength(2);
    },
  );

  it("keeps the sibling completion card shape unchanged (player + ★1 + ack row)", () => {
    const { container } = renderActa([
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Arnau");
    expect(row.textContent).toContain("#2");
    expect(row.textContent).toContain("★1");
    expect(screen.getByText(/Sin cotejar/)).toBeTruthy();
  });
});

describe("LiveEventCardsActa — S2 weather card (Clima)", () => {
  it("renders the resulting weather label + the recorded d6 row", () => {
    const { container } = renderActa([
      ev({
        kind: "weather",
        side: null,
        playerRosterId: null,
        seq: 2,
        payload: { value: "rain", roll: 5 },
      }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // Tag resolves to "Clima"; rows show the RESULT + the recorded d6.
    expect(row.textContent).toContain("Clima");
    expect(row.textContent).toContain("Lluvioso");
    expect(row.textContent).toContain("Tirada");
    expect(row.textContent).toContain("🎲5");
  });

  it("renders just the result row when no d6 was recorded (roll stays optional)", () => {
    const { container } = renderActa([
      ev({
        kind: "weather",
        side: null,
        playerRosterId: null,
        seq: 2,
        payload: { value: "blizzard" },
      }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Clima");
    expect(row.textContent).toContain("Ventisca");
    expect(row.textContent).not.toContain("Tirada");
    expect(row.textContent).not.toContain("🎲");
  });
});

describe("LiveEventCardsActa — DEMO kickoff rows (S3 · T4, MVT-6)", () => {
  it("renders a kickoff row with its registro note and the verbatim rulebook effect", () => {
    renderActa([
      ev({
        kind: "kickoff",
        side: null,
        playerRosterId: null,
        seq: 2,
        payload: {
          phase: "award",
          sum: 6,
          eventId: "hinchas-animan",
          note: "Kickoff · LOS HINCHAS ANIMAN → beneficio para Reavers (5 vs 3)",
        },
      }),
    ]);
    // Labelled with the registro note + the «Efecto» row kept verbatim.
    expect(
      screen.getByText(
        /Kickoff · LOS HINCHAS ANIMAN → beneficio para Reavers \(5 vs 3\)/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Efecto")).toBeTruthy();
    expect(
      screen.getByText(
        /Cada Entrenador tira 1D6 y le suma el número de Animadoras/,
      ),
    ).toBeTruthy();
    // NEVER the raw «kickoff» token of the unknown-kind fallback.
    expect(screen.queryByText("kickoff")).toBeNull();
  });

  it("renders the effect row in the wrapping text variant (no card overflow)", () => {
    // U12 follow-up: the dotted-leader row forces `dd` to one line
    // (`flex: 0 0 auto`), so paragraph-length verbatim effects overflowed the
    // card. The kickoff effect row must use the stacked wrapping variant.
    renderActa([
      ev({
        kind: "kickoff",
        side: null,
        playerRosterId: null,
        seq: 2,
        payload: {
          phase: "award",
          sum: 6,
          eventId: "hinchas-animan",
          note: "Kickoff · LOS HINCHAS ANIMAN → beneficio para Reavers (5 vs 3)",
        },
      }),
    ]);
    const effectRow = screen.getByText("Efecto").closest("div");
    expect(effectRow?.className).toContain("acta__row--text");
  });
});

describe("LiveEventCardsActa — S10.4.2 capture-author badge (T16)", () => {
  it("every coach-registered sheet shows who registered it (the capture author)", () => {
    const { container } = renderActa([
      // A caused casualty: its capture author is the CAUSER's coach (LM-12) —
      // today's guided «+ Baja» is typed by the causer's owner.
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: {
          victimRosterId: "p2",
          causerRosterId: "p4",
          cause: "block",
          roll16: 9,
        },
      }),
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const rows = Array.from(
      container.querySelectorAll("[data-testid='live-event-row']"),
    );
    // Newest first: the casualty pair (injury sheet + derived action sheet),
    // then the completion — all three sheets carry the registrar badge.
    for (const row of rows) {
      expect(row.textContent).toContain("Registrado por Reavers");
    }
  });

  it("a victim-side injury capture badges the victim's coach (S10.4.1 — B marks la herida)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", cause: "dodge", roll16: 8 },
      }),
    ]);
    const row = container.querySelector(
      "[data-testid='live-event-row']",
    ) as HTMLElement;
    expect(row.textContent).toContain("Registrado por Dwarves");
  });

  it("side-less system sheets read «Registro de sistema» (no coach registered them)", () => {
    const { container } = renderActa([
      ev({
        kind: "weather",
        side: null,
        playerRosterId: null,
        seq: 2,
        payload: { value: "rain", roll: 5 },
      }),
    ]);
    const row = container.querySelector(
      "[data-testid='live-event-row']",
    ) as HTMLElement;
    expect(row.textContent).toContain("Registro de sistema");
  });
});

describe("LiveEventCardsActa — T18 folder-tab acta rows (design/acta-folder-tabs/01)", () => {
  it("the category tab carries the LABEL only — earned ★SPP move to a bottom-right tab (never «label · ★N» as the title)", () => {
    const { container } = renderActa([
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    const tab = row.querySelector("[data-testid='acta-card-tab']") as HTMLElement;
    // The title says WHAT HAPPENED (e2e pins «Pase completo») and carries no SPP.
    expect(tab.textContent).toBe("Pase completo");
    expect(tab.textContent).not.toContain("★");
    // The earned ★1 rides the inverted bottom-right tab (artboard .spp).
    const sppTab = row.querySelector("[data-testid='acta-card-spp']") as HTMLElement;
    expect(sppTab).not.toBeNull();
    expect(sppTab.textContent).toContain("★1");
  });

  it("the SPP tab renders ONLY when earned (bruise ★0 → no tab at all)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: {
          victimRosterId: "p2",
          causerRosterId: "p4",
          cause: "block",
          roll16: 3,
          band: "bruise",
        },
      }),
    ]);
    for (const row of Array.from(
      container.querySelectorAll("[data-testid='live-event-row']"),
    )) {
      expect(row.querySelector("[data-testid='acta-card-spp']")).toBeNull();
      expect(row.textContent).not.toContain("★");
    }
  });

  it("the casualty sheet shows the red «Casualty» category tab (red only for Casualty)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", cause: "dodge", roll16: 8 },
      }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    const tab = row.querySelector("[data-testid='acta-card-tab']") as HTMLElement;
    expect(tab.textContent).toBe("Casualty");
    expect(tab.className).toContain("acta__tab--casualty");
    // A non-casualty card's tab is the plain navy one.
    const { container: c2 } = renderActa([
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const tab2 = c2.querySelector("[data-testid='acta-card-tab']") as HTMLElement;
    expect(tab2.className).not.toContain("acta__tab--casualty");
  });

  it("splits the casualty voices: attacker mark + recorder badge in the body, «Lo que informa quien la recibe» holds the injury roll/consequences with ITS OWN recorder badge", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away", // LM-12: the victim's side
        playerRosterId: "p2",
        seq: 2,
        payload: {
          victimRosterId: "p2",
          causerRosterId: "p4",
          cause: "block",
          roll16: 9,
          band: "apaleado",
        },
      }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // BODY keeps the attacker-side mark («X marca herida a Y» = the Causa row)
    // with its recorder badge (the capture author = the causer's coach, T16).
    expect(row.textContent).toContain("por Arnau");
    expect(row.textContent).toContain("Registrado por Reavers");
    // The victim-note sub-box (artboard .victim-note) carries the injury roll
    // and its consequences, plus the RECEIVER's own recorder badge.
    const note = row.querySelector("[data-testid='acta-victim-note']") as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain("Lo que informa quien la recibe");
    expect(note.textContent).toContain("Tirada 1D16");
    expect(note.textContent).toContain("Se pierde el próximo partido");
    expect(note.textContent).toContain("Registrado por Dwarves");
    // The injury roll lives ONLY in the note (the body keeps only the mark).
    expect(note.textContent).not.toContain("por Arnau");
  });
});
