import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("WHY flipped (T24): a caused Magullado IS a herida — the action card carries the causer's ★2 even on a bruise roll (user: «magullado da 2 spp porque es una herida!»)", () => {
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
    // WHY changed (T24, intentional): the old "bruise ★0 → no tab at all" pin
    // encoded the L78 bug. The USER corrected the threshold verbatim — the
    // threshold is the injury ROLL (any result), never the band, so every
    // caused injury pays the causer ★2.
    const rows = Array.from(
      container.querySelectorAll("[data-testid='live-event-row']"),
    );
    const injury = rows.find(
      (li) => li.querySelector(".acta__name")?.textContent === "Blitzer B #1",
    ) as HTMLElement;
    const action = rows.find(
      (li) => li.querySelector(".acta__name")?.textContent === "Arnau #2",
    ) as HTMLElement;
    // The ★2 the CAUSER earns rides the derived action card…
    expect(
      action.querySelector("[data-testid='acta-card-spp']")?.textContent,
    ).toContain("★2");
    // …while the victim's injury card never shows earned points (RAU-47).
    expect(injury.querySelector("[data-testid='acta-card-spp']")).toBeNull();
    expect(injury.textContent).not.toContain("★");
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

describe("LiveEventCardsActa — T19 mirror-chat side identity (design/acta-folder-tabs/04)", () => {
  it("home player rows carry the short who-line «Player · Team» above the description (artboard .who)", () => {
    const { container } = renderActa([
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    const who = row.querySelector("[data-testid='acta-card-who']") as HTMLElement;
    // WHY new (T19, intentional — artboard 04): a short who-line («Khalid ·
    // Águilas») sits above the description so every row says WHOSE side it is.
    expect(who).not.toBeNull();
    expect(who.textContent).toBe("Arnau · Reavers");
    // Above the name/description block in DOM order.
    const name = row.querySelector(".acta__name") as HTMLElement;
    expect(who.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the who-line speaks for the ROW's own event side: the casualty card (victim side) and the derived action card (causer side) mirror opposite", () => {
    // WHY (T19): row side is the EVENT's team side, fixed — never the viewer's.
    // LM-12: a casualty's side is the VICTIM's side.
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 9, band: "apaleado" },
      }),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const injury = rows.find((li) => li.querySelector(".acta__name")?.textContent === "Blitzer B #1") as HTMLElement;
    expect(injury.querySelector("article")?.classList.contains("away")).toBe(true);
    expect(injury.querySelector("[data-testid='acta-card-who']")?.textContent).toBe("Blitzer B · Dwarves");
    const action = rows.find((li) => li.querySelector(".acta__name")?.textContent === "Arnau #2") as HTMLElement;
    expect(action.querySelector("article")?.classList.contains("home")).toBe(true);
    expect(action.querySelector("[data-testid='acta-card-who']")?.textContent).toBe("Arnau · Reavers");
  });

  it("CRITICAL (L67): the category tab keeps design-A colors — navy default, red ONLY for Casualty; an away tab is NEVER red", () => {
    const { container } = renderActa([
      ev({ kind: "completion", side: "away", playerRosterId: "p2", seq: 1 }),
    ]);
    const tab = container.querySelector("[data-testid='acta-card-tab']") as HTMLElement;
    expect(tab.textContent).toBe("Pase completo");
    expect(tab.className).not.toContain("acta__tab--casualty");
  });

  it("side-less rows render NO who-line (the color is per side — no side, no line)", () => {
    const { container } = renderActa([
      ev({ kind: "weather", side: null, playerRosterId: null, seq: 2, payload: { value: "rain", roll: 5 } }),
    ]);
    expect(container.querySelector("[data-testid='acta-card-who']")).toBeNull();
  });

  it("locks the mirror shell in the CSS module (tab right, flipped body radius, right-aligned text, red away who, chat offset)", () => {
    // The geometry lives in CSS — these pins keep the mirror from silently
    // collapsing back to the left design. WHY new (T19, user pick artboard D).
    const css = readFileSync(path.join(__dirname, "eventCardActa.module.css"), "utf8");
    const rule = (pattern: RegExp, label: string) => {
      const m = pattern.exec(css);
      if (!m) throw new Error(`mirror-lock: the "${label}" rule is missing from eventCardActa.module.css`);
      return m[1].replace(/\s+/g, " ").trim();
    };
    // Category tab TOP-RIGHT on mirrored rows (position only — colors stay A).
    const tab = rule(/\.away \.acta__tab\s*\{([\s\S]*?)\}/, ".away .acta__tab");
    expect(tab).toContain("right: 0;");
    // Body radius flips (top-right square where the tab meets the body).
    expect(rule(/\.away \.acta__body\s*\{([\s\S]*?)\}/, ".away .acta__body")).toContain(
      "border-radius: 8px 0 8px 8px;",
    );
    // Who-line: navy home text, RED away text right-aligned (side identity —
    // this red is WHO text, never a category tab color).
    expect(rule(/\.acta__who\s*\{([\s\S]*?)\}/, ".acta__who")).toContain("color: var(--color-navy);");
    const awayWho = rule(/\.away \.acta__who\s*\{([\s\S]*?)\}/, ".away .acta__who");
    expect(awayWho).toContain("color: var(--color-red);");
    expect(awayWho).toContain("text-align: right;");
    // Right-aligned description/rolls/author text on mirrored rows.
    expect(rule(/\.away \.acta__name\s*\{([\s\S]*?)\}/, ".away .acta__name")).toContain("text-align: right;");
    expect(rule(/\.away \.acta__pos\s*\{([\s\S]*?)\}/, ".away .acta__pos")).toContain("text-align: right;");
    // Chat offset: home rows sit LEFT, away rows sit RIGHT (92% width).
    const away = rule(/\.away\s*\{([\s\S]*?)\}/, ".away");
    expect(away).toContain("width: 92%;");
    expect(away).toContain("margin-left: auto;");
    expect(rule(/\.home\s*\{([\s\S]*?)\}/, ".home")).toContain("margin-right: auto;");
  });
});

/**
 * T24 (L78 + user corrections, «external-assets/Puntos de SPP.md»): the SPP
 * earn rule on the acta cards. SÍ: a valid Block/Blitz knockdown with a
 * RESOLVED injury roll pays the causer ★2 for ANY result. ZERO (user table):
 * Faltas, Both-Down/pifias (the `bothDown` flag rows), auto-lesiones — and a
 * victim row without an attributable causer shows NO tab rather than a wrong
 * one (the causer context rides the chain's «Derribo» row; the timeline keeps
 * that attribution, see actaTurnTimeline.test.tsx).
 */
describe("LiveEventCardsActa — T24 SPP earn rule («Puntos de SPP.md», L78)", () => {
  it("Faltas pay NOTHING: the foul-caused casualty renders NO ★ anywhere (a foul earns no SPP even with a resolved roll)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", causerRosterId: "p4", cause: "foul", roll16: 12, band: "grave" },
      }),
    ]);
    expect(container.textContent).not.toContain("★");
  });

  it("Both-Down/pifias pay NOTHING: the bothDown-flagged casualty (causer on the row — the DEC-1 canonical shape) renders NO ★ anywhere", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 11, band: "grave", bothDown: true },
      }),
    ]);
    expect(container.textContent).not.toContain("★");
  });

  it("a victim-recorded row without an attributable causer renders NO tab anywhere («show no tab rather than a wrong one»)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", cause: "block", roll16: 12, band: "grave" },
      }),
    ]);
    expect(container.textContent).not.toContain("★");
  });
});

describe("LiveEventCardsActa — T20 UX round 3 (L70): SPP visible, victim-note mirror, body identity tint, SPP mirror", () => {
  it("the derived action card keeps the earned ★2 when the casualty payload carries only the 1D16 roll (demo shape — no server band) (L70)", () => {
    const { container } = renderActa([
      ev({
        kind: "casualty",
        side: "away",
        playerRosterId: "p2",
        seq: 2,
        payload: { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 9 },
      }),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(2);
    // WHY new (T20, intentional): the user reports earned SPP are NOT showing —
    // the demo's simulated server records the 1D16 roll but never the derived
    // `band`, so the ★2 the CAUSER earned vanished from the action card. The
    // roll is enough (9 = apaleado = lasting).
    const action = rows[1] as HTMLElement;
    const sppTab = action.querySelector("[data-testid='acta-card-spp']") as HTMLElement;
    expect(sppTab).not.toBeNull();
    expect(sppTab.textContent).toContain("★2");
    // RAU-47 guard: the VICTIM's card still shows NO earned SPP.
    expect((rows[0] as HTMLElement).querySelector("[data-testid='acta-card-spp']")).toBeNull();
  });

  it("locks the T20 shell in the CSS module: victim-note accent flips RIGHT on away rows, body tints identify the acting side, and the SPP tab mirrors bottom-left on away rows", () => {
    // The geometry lives in CSS — these pins keep the T20 UX round (the user's
    // verbatim fixes) from silently collapsing back. WHY new (T20, L70).
    const css = readFileSync(path.join(__dirname, "eventCardActa.module.css"), "utf8");
    const rule = (pattern: RegExp, label: string) => {
      const m = pattern.exec(css);
      if (!m) throw new Error(`t20-lock: the "${label}" rule is missing from eventCardActa.module.css`);
      return m[1].replace(/\s+/g, " ").trim();
    };
    // (1) Victim-note mirroring (the user's exact words): «cuando el jugador
    // es el de la derecha deberiamos cambiar border-l-red y border-l-[3px] a
    // border-r-red y border-r-[3px]» — the accent stays on the mirrored OUTER
    // edge; home/neutral keep the left rule as the default.
    const awayNote = rule(/\.away \.victim__note\s*\{([\s\S]*?)\}/, ".away .victim__note");
    expect(awayNote).toContain("border-right: 3px solid var(--color-red);");
    expect(awayNote).toContain("border-left: 1px solid var(--color-border);");
    expect(awayNote).toContain("border-radius: 6px 0 0 6px;");
    const baseNote = rule(/\.victim__note\s*\{([\s\S]*?)\}/, ".victim__note");
    expect(baseNote).toContain("border-left: 3px solid var(--color-red);");
    // (2) Body identity tint (L70 «las aguilas azules y los colmillos los
    // colmillos»): navy tint on home rows, red tint on away rows — the tint is
    // BODY identity, never the category tab (which keeps design A).
    const homeBody = rule(/\.home \.acta__body\s*\{([\s\S]*?)\}/, ".home .acta__body");
    expect(homeBody).toContain("background: color-mix(in srgb, var(--color-navy) 2.5%, var(--color-panel));");
    const awayBody = rule(/\.away \.acta__body\s*\{([\s\S]*?)\}/, ".away .acta__body");
    expect(awayBody).toContain("background: color-mix(in srgb, var(--color-red) 2.5%, var(--color-panel));");
    // The T19 mirror radius survives on the same rule.
    expect(awayBody).toContain("border-radius: 8px 0 8px 8px;");
    // (3) SPP mirror: home = bottom-right (base margin), away = bottom-left.
    const awaySpp = rule(/\.away \.acta__spp\s*\{([\s\S]*?)\}/, ".away .acta__spp");
    expect(awaySpp).toContain("margin-left: 0;");
    expect(awaySpp).toContain("margin-right: auto;");
    const baseSpp = rule(/\.acta__spp\s*\{([\s\S]*?)\}/, ".acta__spp");
    expect(baseSpp).toContain("margin: -1px 0 0 auto;");
  });

  it("the side tints keep WCAG AA (≥4.5:1) for every body text color in BOTH palettes (the tint is identity, never contrast debt) (L70)", () => {
    // Tripwire: the alpha is parsed FROM the module — strengthen the tint (or
    // darken a text token in app/globals.css) and this fails first. Binding
    // token: the scoreboard-theme slate (4.76:1 on white — the tightest text).
    const css = readFileSync(path.join(__dirname, "eventCardActa.module.css"), "utf8");
    const globals = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    // Both palettes, in file order: the default Reglamento-vintage @theme
    // first, the [data-theme="scoreboard"] override second.
    const token = (name: string): [string, string] => {
      const matches = [...globals.matchAll(new RegExp(`--color-${name}: (#[0-9a-f]{6});`, "g"))].map((m) => m[1]);
      if (matches.length < 2) throw new Error(`contrast-lock: palette token "${name}" missing from app/globals.css`);
      return [matches[0], matches[1]];
    };
    const [navy, red, panel, ink, slate, slateStrong] = (
      ["navy", "red", "panel", "ink", "slate", "slate-strong"] as const
    ).map(token);
    const alphaOf = (side: "navy" | "red"): number => {
      const m = new RegExp(`color-mix\\(in srgb, var\\(--color-${side}\\) ([0-9.]+)%, var\\(--color-panel\\)\\)`).exec(css);
      if (!m) throw new Error(`contrast-lock: the ${side} body tint is missing from eventCardActa.module.css`);
      return Number(m[1]) / 100;
    };
    const hex = (h: string): [number, number, number] => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
    ];
    const lin = (c: number): number => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const mix = (fg: [number, number, number], bg: [number, number, number], a: number) =>
      fg.map((c, i) => c * a + bg[i] * (1 - a)) as [number, number, number];
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (let palette = 0; palette < 2; palette += 1) {
      for (const [sideName, sideToken] of [["navy", navy], ["red", red]] as const) {
        const bg = mix(hex(sideToken[palette]), hex(panel[palette]), alphaOf(sideName));
        for (const textToken of [ink[palette], slate[palette], slateStrong[palette], sideToken[palette]]) {
          expect(
            ratio(hex(textToken), bg),
            `${sideName} tint vs ${textToken} (palette ${palette}) must stay WCAG AA`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

/**
 * T27 (L87/L88 — the user's verbatim skill/team map): the derived action card
 * on the CAUSER's side carries the flag rows' awards. The per-player flags ride
 * the casualty payload as `causerSkills` (the roster record's skill refs) and
 * the per-team flag as `brawlinBrutes` — data-driven, the card layer needs no
 * new props. Defaults pinned (user): special-action / thrown-landing /
 * dodge-fall render NO ★ without their skill, TD renders ★3 without the team
 * rule, and the victim's card never shows earned points (RAU-47).
 */
describe("LiveEventCardsActa — T27 skill & team-rule SPP exceptions (L87/L88)", () => {
  const caused = (payload: Record<string, unknown>) =>
    ev({
      kind: "casualty",
      side: "away",
      playerRosterId: "p2",
      seq: 2,
      payload: { victimRosterId: "p2", causerRosterId: "p4", ...payload },
    });

  /** The ★SPP tab on the row whose player line reads `{name} #n`. */
  const sppOf = (container: HTMLElement, name: string): string | null => {
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const row = rows.find(
      (li) => li.querySelector(".acta__name")?.textContent === name,
    ) as HTMLElement | undefined;
    return row?.querySelector("[data-testid='acta-card-spp']")?.textContent ?? null;
  };

  it("(a) «Innovador Violento»: the special-action casualty carries the causer's ★2 on the derived action card — the victim's card shows NO ★", () => {
    const { container } = renderActa([
      caused({ cause: "specialAction", roll16: 12, causerSkills: ["Innovador Violento"] }),
    ]);
    expect(sppOf(container, "Arnau #2")).toContain("★2");
    expect(sppOf(container, "Blitzer B #1")).toBeNull();
  });

  it("(a) DEFAULT: the special-action casualty renders NO ★ anywhere without «Innovador Violento»", () => {
    const { container } = renderActa([
      caused({ cause: "specialAction", roll16: 12 }),
    ]);
    expect(container.textContent).not.toContain("★");
  });

  it("(b) «Vuelo Letal» (Right-Stuff only): the thrown-landing row carries the thrown player's ★2 — the skill without Right Stuff renders NO ★", () => {
    const { container } = renderActa([
      caused({
        cause: "thrownLanding",
        roll16: 12,
        causerSkills: ["Vuelo Letal", "Right Stuff"],
      }),
    ]);
    expect(sppOf(container, "Arnau #2")).toContain("★2");

    const { container: noRightStuff } = renderActa([
      caused({ cause: "thrownLanding", roll16: 12, causerSkills: ["Vuelo Letal"] }),
    ]);
    expect(noRightStuff.textContent).not.toContain("★");
  });

  it("(c) «Llave de Brazo»: the escape-fall row flips from the T24 zero to ★2 with the skill — the default failed-dodge row renders NO ★", () => {
    const { container } = renderActa([
      caused({ cause: "dodge", roll16: 9, causerSkills: ["Llave de Brazo"] }),
    ]);
    expect(sppOf(container, "Arnau #2")).toContain("★2");

    const { container: bare } = renderActa([caused({ cause: "dodge", roll16: 9 })]);
    expect(bare.textContent).not.toContain("★");
  });

  it("«Brutos Peleones»: a caused casualty carries ★3 instead of ★2 — and a TD ★2 instead of ★3 (the TD ★3 default stays pinned)", () => {
    const { container } = renderActa([
      caused({ cause: "block", roll16: 12, brawlinBrutes: true }),
    ]);
    expect(sppOf(container, "Arnau #2")).toContain("★3");

    const { container: bbTd } = renderActa([
      ev({ kind: "td", side: "home", playerRosterId: "p1", seq: 1, payload: { brawlinBrutes: true } }),
    ]);
    expect(sppOf(bbTd, "Blitzer A #1")).toContain("★2");

    const { container: td } = renderActa([
      ev({ kind: "td", side: "home", playerRosterId: "p1", seq: 1 }),
    ]);
    expect(sppOf(td, "Blitzer A #1")).toContain("★3");
  });
});
