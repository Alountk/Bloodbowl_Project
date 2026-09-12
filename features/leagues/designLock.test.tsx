import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { LiveEventCardsActa } from "./eventCardActa";
import { MatchTimelineBar } from "./matchTimelineBar";
import { MatchView } from "./MatchView";
import type { LiveMatchEventDto, LiveMatchView, MatchDetail, MatchTeamDetail } from "./api";

/**
 * DESIGN-LOCK suite: the user validated the v4 "Acta" data-sheet event cards and
 * the rulebook layout on the design-study branch. The PRODUCTION live-match feed
 * now renders `LiveEventCardsActa`; the v3 compact rows (`LiveEventCards`) are the
 * ARCHIVED reference and keep their own behavior tests (`liveEventCards.test.tsx`).
 * These tests lock TODAY's production output so any drift (class rename, geometry
 * change, reintroduced v3 atom, unbolded value, missing ack row, duplicated page
 * header) fails the suite. TEST-ONLY: no production file is touched.
 *
 * A  — `eventCardActa.module.css` is read as a raw string and the validated Acta
 *       declarations are asserted (deleting/changing one fails).
 * B  — rendered Acta structure per family: the `.acta` shell + side class, the
 *       tag/meta header, the name/dorsal/pos line, the dotted-leader `<dl>` with
 *       BOLD values (Efecto / Tirada 1D16 / Causa / Marcador / Víctima / Acción /
 *       Motivo / Tesorería / Hora / Minuto / Victoria / Local / Visitante), the
 *       derived casualty ACTION card and the ack row on ackable kinds only.
 * C  — the rulebook sticky header via a stubbed MatchView (back arrow, no
 *       duplicated page header, TURNO button, half badge, hero mini-line).
 * D  — MatchTimelineBar (light track, always-on boundary markers, chips).
 */

// ---------------------------------------------------------------------------
// A. Raw CSS module lock — v4 Acta (production feed)
// ---------------------------------------------------------------------------

const css = readFileSync(path.join(__dirname, "eventCardActa.module.css"), "utf8");

/** Extracts a single rule block (verbatim inner text) or throws with a hint. */
function block(pattern: RegExp, label: string): string {
  const m = pattern.exec(css);
  if (!m) throw new Error(`design-lock: the CSS module no longer contains the "${label}" rule`);
  return m[1];
}

const actaBlock = block(/\.acta\s*\{([\s\S]*?)\}/, ".acta");
const homeBlock = block(/\.home\s*\{([\s\S]*?)\}/, ".home");
const awayBlock = block(/\.away\s*\{([\s\S]*?)\}/, ".away");
const neutralBlock = block(/\.neutral\s*\{([\s\S]*?)\}/, ".neutral");
const tagBlock = block(/\.acta__tag\s*\{([\s\S]*?)\}/, ".acta__tag");
const metaBlock = block(/\.acta__meta\s*\{([\s\S]*?)\}/, ".acta__meta");
const nameBlock = block(/\.acta__name\s*\{([\s\S]*?)\}/, ".acta__name");
const posBlock = block(/\.acta__pos\s*\{([\s\S]*?)\}/, ".acta__pos");
const dataBlock = block(/\.acta__data\s*\{([\s\S]*?)\}/, ".acta__data");
const dataFlushBlock = block(/\.acta__data--flush\s*\{([\s\S]*?)\}/, ".acta__data--flush");
const rowBlock = block(/\.acta__row\s*\{([\s\S]*?)\}/, ".acta__row");
const dtBlock = block(/\.acta__row dt\s*\{([\s\S]*?)\}/, ".acta__row dt");
const leaderBlock = block(/\.acta__leader\s*\{([\s\S]*?)\}/, ".acta__leader");
const ddBlock = block(/\.acta__row dd\s*\{([\s\S]*?)\}/, ".acta__row dd");
const ddBoldBlock = block(/\.acta__row dd b\s*\{([\s\S]*?)\}/, ".acta__row dd b");
const ackBlock = block(/\.ack\s*\{([\s\S]*?)\}/, ".ack");

/** Banned v3 atoms: the Acta layout is FLAT and full-width — it must never
 * reintroduce the archived compact card's split geometry. Comments included. */
const BANNED = ["linear-gradient", "grid-template-areas", "max-width: 68", "@media"];

describe("A. eventCardActa.module.css — validated Acta declarations", () => {
  it("never re-introduces the archived v3 split/gradient/media atoms", () => {
    for (const atom of BANNED) {
      expect(css, `module must not contain "${atom}"`).not.toContain(atom);
    }
  });

  it("locks the .acta panel base: panel background, 1px border, 3px top rule, radius and padding", () => {
    expect(actaBlock).toContain("background: var(--color-panel);");
    expect(actaBlock).toContain("border: 1px solid var(--color-border);");
    expect(actaBlock).toContain("border-top: 3px solid var(--side, var(--color-slate));");
    expect(actaBlock).toContain("border-radius: 3px;");
    expect(actaBlock).toContain("padding: 14px 18px 16px;");
    expect(actaBlock).toContain("box-sizing: border-box;");
  });

  it("locks the side identity custom property: navy home / red away / slate neutral", () => {
    expect(homeBlock).toContain("--side: var(--color-navy);");
    expect(awayBlock).toContain("--side: var(--color-red);");
    expect(neutralBlock).toContain("--side: var(--color-slate);");
  });

  it("locks the tag/meta header typography (uppercase 10px, tag on --side, tabular meta)", () => {
    expect(tagBlock).toContain("font-size: 10px;");
    expect(tagBlock).toContain("font-weight: 700;");
    expect(tagBlock).toContain("letter-spacing: .12em;");
    expect(tagBlock).toContain("text-transform: uppercase;");
    expect(tagBlock).toContain("color: var(--side, var(--color-slate));");
    expect(metaBlock).toContain("font-size: 10px;");
    expect(metaBlock).toContain("font-weight: 700;");
    expect(metaBlock).toContain("letter-spacing: .06em;");
    expect(metaBlock).toContain("text-transform: uppercase;");
    expect(metaBlock).toContain("color: var(--color-slate);");
    expect(metaBlock).toContain("font-variant-numeric: tabular-nums;");
  });

  it("locks the serif name + position line and the data-list rule", () => {
    expect(nameBlock).toContain("font-family: var(--font-display);");
    expect(nameBlock).toContain("font-size: 17px;");
    expect(nameBlock).toContain("font-weight: 700;");
    expect(posBlock).toContain("font-size: 11px;");
    expect(posBlock).toContain("color: var(--color-slate);");
    expect(dataBlock).toContain("border-top: 1px solid var(--color-border);");
    expect(dataFlushBlock).toContain("border-top: 0;");
  });

  it("locks the dotted leader row: baseline flex, uppercase label, dotted leader and right-aligned value", () => {
    expect(rowBlock).toContain("display: flex;");
    expect(rowBlock).toContain("align-items: baseline;");
    expect(dtBlock).toContain("text-transform: uppercase;");
    expect(dtBlock).toContain("font-size: 10px;");
    expect(leaderBlock).toContain("flex: 1 1 auto;");
    expect(leaderBlock).toContain("border-bottom: 1px dotted var(--color-border-subtle);");
    expect(leaderBlock).toContain("transform: translateY(-3px);");
    expect(ddBlock).toContain("text-align: right;");
  });

  it("locks the bold dd value rule and the right-aligned ack row", () => {
    expect(ddBoldBlock).toContain("color: var(--color-ink);");
    expect(ddBoldBlock).toContain("font-weight: 700;");
    expect(ackBlock).toContain("justify-content: flex-end;");
  });
});

// ---------------------------------------------------------------------------
// B. Rendered card structure per kind
// ---------------------------------------------------------------------------

function player(id: string, name: string, positionalKey = "blitzer") {
  return { rosterPlayerId: id, name, positionalKey, pe: 0, skills: {}, injuries: {}, alive: true, missNextMatch: false, valueBonus: 0 };
}

const homeTeam: MatchTeamDetail = {
  id: "t1",
  name: "Reavers",
  raceId: "human",
  user: { id: "u1", name: "Coach A", email: null },
  players: [player("p1", "Blitzer A"), player("p4", "Arnau", "thrower")],
};

const awayTeam: MatchTeamDetail = {
  id: "t2",
  name: "Dwarves",
  raceId: "dwarf",
  user: { id: "u2", name: "Coach B", email: null },
  players: [player("p2", "Blitzer B"), player("p8", "Trash", "blocker")],
};

function ev(
  seq: number,
  kind: string,
  side: "home" | "away" | null,
  payload: Record<string, unknown> = {},
  playerRosterId: string | null = null,
  turnNumber = 1,
  at = 1000,
): LiveMatchEventDto {
  return { seq, kind, side, playerRosterId, half: 1, turnNumber, payload, at };
}

function renderCards(events: LiveMatchEventDto[]) {
  return render(
    <LiveEventCardsActa
      events={events}
      startedAt={1000}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      viewerSide={null}
      now={Date.now()}
      onAck={() => undefined}
    />,
  );
}

describe("B. LiveEventCardsActa — validated Acta rendered structure", () => {
  it("locks the feed shell: an ordered list on bg-background with the 2.5 gap and the chronology aria", () => {
    const { container } = renderCards([ev(1, "td", "home", {}, "p1", 3, 2000)]);
    const ol = container.querySelector("ol");
    expect(ol).toBeTruthy();
    expect(ol?.getAttribute("aria-label")).toBe("Cronología del partido");
    const cls = ol?.getAttribute("class") ?? "";
    expect(cls).toContain("bg-background");
    expect(cls).toContain("flex flex-col");
    expect(cls).toContain("gap-2.5");
    expect(container.querySelector("[data-testid='live-event-row']")).toBeTruthy();
  });

  it("renders newest first (seq desc) and skips the generic 'turn' row", () => {
    const { container } = renderCards([
      ev(1, "start", null, {}, null, 1, 1000),
      ev(2, "turn", null, {}, null, 1, 1100),
      ev(3, "endMatch", null, {}, null, 8, 481000),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(2);
    expect(container.textContent).not.toContain("Fin de turno");
    expect(rows[0].querySelector(".acta__tag")?.textContent).toBe("Fin del partido");
    expect(rows[1].querySelector(".acta__tag")?.textContent).toBe("Inicio del partido");
  });

  it("locks the home TD sheet: .acta + home, tag/meta, name/dorsal/pos, bold Marcador row and ack", () => {
    const { container } = renderCards([ev(5, "td", "home", {}, "p1", 4, 241000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("acta")).toBe(true);
    expect(article.classList.contains("home")).toBe(true);
    expect(article.classList.contains("away")).toBe(false);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Touchdown · ★3");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Turno 4 · 4'");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Blitzer A #1");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Human Blitzer · Reavers");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Marcador");
    expect(row.querySelector(".acta__leader")).toBeTruthy();
    expect(row.querySelector("dd")?.className).toContain("acta__num");
    expect(row.querySelector("dd b")?.textContent).toBe("1 - 0");
    expect(article.querySelector(".ack")).toBeTruthy();
  });

  it("locks the away TD sheet: .acta + away and the mirrored partial score", () => {
    const { container } = renderCards([ev(6, "td", "away", {}, "p2", 5, 241000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("away")).toBe(true);
    expect(article.classList.contains("home")).toBe(false);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Touchdown · ★3");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Turno 5 · 4'");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Blitzer B #1");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Dwarf Blitzer · Dwarves");
    expect(article.querySelector("dd b")?.textContent).toBe("0 - 1");
    expect(article.querySelector(".ack")).toBeTruthy();
  });

  it("locks the completion sheet: ★1 tag, no data list, ack row", () => {
    const { container } = renderCards([ev(6, "completion", "home", {}, "p4", 3, 2000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Pase completo · ★1");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Arnau #2");
    expect(article.querySelector(".acta__data")).toBeNull();
    expect(article.querySelector(".ack")).toBeTruthy();
  });

  it("locks the foul sheet: Falta tag + the bold Víctima value", () => {
    const { container } = renderCards([ev(8, "foul", "home", { victimRosterId: "p8" }, "p1", 3, 2000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("home")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Falta");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Víctima");
    expect(row.querySelector("dd")?.textContent).toBe("a Trash (#2)");
    expect(row.querySelector("dd b")?.textContent).toBe("Trash");
    expect(article.querySelector(".ack")).toBeTruthy();
  });

  it("locks the casualty INJURY sheet: Baja tag, Efecto/Tirada 1D16/Causa rows with bold values and the ack", () => {
    const { container } = renderCards([
      ev(9, "casualty", "away", { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 9, band: "permanent" }, "p2", 6, 3000),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(2);
    const injury = rows.find((li) => li.querySelector(".acta__name")?.textContent === "Blitzer B #1") as HTMLElement;
    expect(injury).toBeTruthy();
    expect(injury.querySelector("article")?.classList.contains("away")).toBe(true);
    expect(injury.querySelector(".acta__tag")?.textContent).toBe("Baja");
    expect(injury.querySelector(".acta__meta")?.textContent).toBe("Turno 6 · 0'");
    const dataRows = Array.from(injury.querySelectorAll(".acta__row"));
    expect(dataRows).toHaveLength(3);
    expect(dataRows[0].querySelector("dt")?.textContent).toBe("Efecto");
    expect(dataRows[0].querySelector("dd b")?.textContent).toBe("Se pierde el próximo partido");
    expect(dataRows[1].querySelector("dt")?.textContent).toBe("Tirada 1D16");
    expect(dataRows[1].querySelector("dd")?.className).toContain("acta__num");
    expect(dataRows[1].querySelector("dd b")?.textContent).toBe("9");
    expect(dataRows[2].querySelector("dt")?.textContent).toBe("Causa");
    expect(dataRows[2].querySelector("dd")?.textContent).toBe("por Arnau (#2) · Bloqueo");
    expect(Array.from(dataRows[2].querySelectorAll("dd b")).map((b) => b.textContent)).toEqual(["Arnau", "Bloqueo"]);
    expect(injury.querySelector(".ack")).toBeTruthy();
  });

  it("locks the derived ACTION card on the causer's side: Bloqueo · ★2 + bold Acción victim, NO ack", () => {
    const { container } = renderCards([
      ev(9, "casualty", "away", { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 9, band: "permanent" }, "p2", 6, 3000),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const action = rows.find((li) => li.querySelector(".acta__name")?.textContent === "Arnau #2") as HTMLElement;
    expect(action).toBeTruthy();
    expect(action.querySelector("article")?.classList.contains("home")).toBe(true);
    expect(action.querySelector(".acta__tag")?.textContent).toBe("Bloqueo · ★2");
    expect(action.querySelector(".acta__pos")?.textContent).toBe("Human Thrower · Reavers");
    const row = action.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Acción");
    expect(row.querySelector("dd")?.textContent).toBe("Herida a Blitzer B");
    expect(row.querySelector("dd b")?.textContent).toBe("Blitzer B");
    expect(action.querySelector(".ack")).toBeNull();
  });

  it("locks the turnStart team sheet: Inicio de turno + Empieza el turno, Motivo row when a reason exists, no ack", () => {
    const { container } = renderCards([ev(7, "turnStart", "home", { reason: "injury" }, null, 4, 4600)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("home")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Inicio de turno");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Turno 4 · 0'");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Reavers");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Empieza el turno");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Motivo");
    expect(row.querySelector("dd b")?.textContent).toBe("Baja");
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the turnStart sheet with no reason: no data list and no ack", () => {
    const { container } = renderCards([ev(4, "turnStart", "away", {}, null, 4, 4000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("away")).toBe(true);
    expect(article.querySelector(".acta__name")?.textContent).toBe("Dwarves");
    expect(article.querySelector(".acta__data")).toBeNull();
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the expensive_mistake team sheet: Error costoso, Incidente grave, bold Tesorería value, no ack", () => {
    const { container } = renderCards([
      ev(6, "expensive_mistake", "home", { outcome: "serious-incident", treasuryBefore: 234000, treasuryAfter: 214000 }, null, 1, 1000),
    ]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("home")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Error costoso");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Kickoff");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Reavers");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Incidente grave");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Tesorería");
    expect(row.querySelector("dd b")?.textContent).toBe("234.000 → 214.000 M.O.");
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the fan_factor neutral sheet: Local / Visitante rows with bold totals and no ack", () => {
    const { container } = renderCards([
      ev(7, "fan_factor", null, { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } }, null, 1, 1000),
    ]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("neutral")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Factor de aficionados");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Kickoff");
    const rows = Array.from(article.querySelectorAll(".acta__row"));
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector("dt")?.textContent).toBe("Local");
    expect(rows[0].querySelector("dd")?.textContent).toBe("👥2 + 🎲2 = 4");
    expect(rows[0].querySelector("dd b")?.textContent).toBe("4");
    expect(rows[1].querySelector("dt")?.textContent).toBe("Visitante");
    expect(rows[1].querySelector("dd")?.textContent).toBe("👥1 + 🎲3 = 4");
    expect(rows[1].querySelector("dd b")?.textContent).toBe("4");
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the start sheet: Inicio del partido + Kickoff + a bold Hora time, flush data, no ack", () => {
    const { container } = renderCards([ev(1, "start", null, {}, null, 1, 1000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("neutral")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Inicio del partido");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Kickoff");
    expect(article.querySelector(".acta__name")).toBeNull();
    expect(article.querySelector(".acta__data")?.className).toContain("acta__data--flush");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Hora");
    expect(row.querySelector("dd b")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the endHalf sheet: Fin de la mitad + Mitad 1 + a bold Minuto, no ack", () => {
    const { container } = renderCards([ev(3, "endHalf", null, {}, null, 4, 200000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Fin de la mitad");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Mitad 1");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Minuto");
    expect(row.querySelector("dd b")?.textContent).toBe("3'");
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the endMatch sheet: Fin del partido + Final + a bold Hora, no ack", () => {
    const { container } = renderCards([ev(2, "endMatch", null, {}, null, 8, 481000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Fin del partido");
    expect(article.querySelector(".acta__meta")?.textContent).toBe("Final");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Hora");
    expect(row.querySelector("dd b")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the concede neutral sheet: Concesión + Se rinde + a bold Victoria, no ack", () => {
    const { container } = renderCards([ev(9, "concede", "home", { winnerSide: "away" }, null, 3, 4000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("neutral")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Concesión");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Reavers");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Se rinde");
    const row = article.querySelector(".acta__row") as HTMLElement;
    expect(row.querySelector("dt")?.textContent).toBe("Victoria");
    expect(row.querySelector("dd b")?.textContent).toBe("Dwarves");
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the journeyman team sheet: Novato tag, the join name/pos and no data list", () => {
    const { container } = renderCards([ev(7, "journeyman", "home", { count: 1, names: ["Aldric Martillo"] }, null, 1, 1000)]);
    const article = container.querySelector("article") as HTMLElement;
    expect(article.classList.contains("home")).toBe(true);
    expect(article.querySelector(".acta__tag")?.textContent).toBe("Novato");
    expect(article.querySelector(".acta__name")?.textContent).toBe("Aldric Martillo");
    expect(article.querySelector(".acta__pos")?.textContent).toBe("Se une como novato");
    expect(article.querySelector(".acta__data")).toBeNull();
    expect(article.querySelector(".ack")).toBeNull();
  });

  it("locks the ack row on ACKABLE kinds only (td/completion/casualty/foul), never on system/team cards", () => {
    const ackable: [string, string, "home"][] = [
      ["td", "p1", "home"],
      ["completion", "p4", "home"],
      ["foul", "p1", "home"],
      ["casualty", "p1", "home"],
    ];
    for (const [kind, playerId, side] of ackable) {
      const payload = kind === "foul" ? { victimRosterId: "p8" } : {};
      const { container, unmount } = renderCards([ev(1, kind, side, payload, playerId, 1, 1000)]);
      expect(container.querySelector(".ack"), `${kind} must carry the ack row`).toBeTruthy();
      unmount();
    }
    const system: [string, "home" | null][] = [
      ["start", null],
      ["turnStart", "home"],
      ["endHalf", null],
      ["endMatch", null],
      ["expensive_mistake", "home"],
      ["fan_factor", null],
      ["concede", "home"],
      ["journeyman", "home"],
    ];
    for (const [kind, side] of system) {
      const { container, unmount } = renderCards([ev(1, kind, side, {}, null, 1, 1000)]);
      expect(container.querySelector(".ack"), `${kind} must not carry the ack row`).toBeNull();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// C. rulebook sticky header via a stubbed MatchView
// ---------------------------------------------------------------------------

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: { user: { id: "u1" } } })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useSession).mockReturnValue({ data: { user: { id: "u1" } } } as never);
});

function fixtureDetail(live: LiveMatchView): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T20:00:00",
      winnerId: null,
      homeScore: live.status === "finished" ? live.homeScore : null,
      awayScore: live.status === "finished" ? live.awayScore : null,
      status: live.status === "finished" ? "played" : "scheduled",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: null,
    homeTeam,
    awayTeam,
    live,
    liveWinnings: null,
  };
}

function finishedLive(): LiveMatchView {
  return {
    seq: 12,
    status: "finished",
    half: 2,
    turnNumber: 8,
    activeSide: "away",
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: 1000,
    elapsed: 3100,
    homeTurnMs: 1500,
    awayTurnMs: 1600,
    homeScore: 2,
    awayScore: 1,
    paused: false,
    finishedAt: 5000,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null }, resolutionState: { home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false }, away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false } },
    events: [
      { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
      { seq: 5, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 2000 },
      { seq: 9, kind: "casualty", side: "away", playerRosterId: "p2", half: 2, turnNumber: 6, payload: { band: "grave" }, at: 3000 },
      { seq: 10, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 4000 },
    ],
  };
}

function liveMatch(): LiveMatchView {
  return {
    seq: 6,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 8000,
    elapsed: 2100,
    homeTurnMs: 2100,
    awayTurnMs: 0,
    homeScore: 1,
    awayScore: 0,
    paused: false,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null }, resolutionState: { home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false }, away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false } },
    events: [
      { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
      { seq: 5, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 9000 },
    ],
  };
}

function stubMatch(detail: MatchDetail) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail) })),
  );
}

describe("C. rulebook sticky header (MatchView)", () => {
  it("locks the finished-live header: back arrow, no duplicated page header, meta row, frozen score, no turn controls", async () => {
    stubMatch(fixtureDetail(finishedLive()));
    const { container } = render(<MatchView leagueId="l1" fixtureId="f1" />);
    await waitFor(() => expect(container.textContent).toContain("Fin del partido"));

    const header = screen.getByTestId("rulebook-header");
    expect(header).toBeTruthy();
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("z-40");
    expect(header.className).toContain("bg-navy");
    // The v7 back navigation lives ONLY in the sticky header (one Volver link).
    const back = within(header).getByRole("link", { name: "Volver a la jornada" });
    expect(back.getAttribute("href")).toBe("/leagues/l1");
    expect(screen.getAllByRole("link", { name: /Volver/i })).toHaveLength(1);
    // The duplicated "Partido {round}" page header is GONE (no heading above it).
    expect(screen.queryByRole("heading", { name: /Partido 1/ })).toBeNull();
    // Meta row + frozen PER-SIDE scores + half/turn note; the live mini-line is
    // absent (Concept B: no "En juego · Tiempo", no composed center score).
    expect(screen.getByText("Clima · Estándar")).toBeTruthy();
    expect(screen.getByText("Estadio · Reglamentario")).toBeTruthy();
    expect(screen.getByTestId("score-home").textContent).toBe("2");
    expect(screen.getByTestId("score-away").textContent).toBe("1");
    expect(screen.queryByTestId("live-score")).toBeNull();
    expect(screen.getByText("2ª Parte")).toBeTruthy();
    expect(screen.getByText("Mitad 2 · Turno 8")).toBeTruthy();
    expect(screen.queryByText(/En juego · Tiempo/)).toBeNull();
    // Concept B: a finished header shows NO coach accent (not live) and keeps
    // the per-team clocks frozen — the accent is live-and-active-coach only.
    expect(within(header).queryByText(/Tu turno/)).toBeNull();
    // MVT-3/MVT-7: a FINISHED match has NO pass control anywhere — the bottom
    // dock is hidden (not live / no side), so the "Dar el turno" button appears
    // nowhere (count 0) and no "Turno {team}" status/foot-top reason chip.
    expect(within(header).queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Dar el turno/i })).toHaveLength(0);
    expect(screen.queryByText("Turno Reavers")).toBeNull();
    // RAU-38: a finished match shows no concede control either.
    expect(screen.queryByRole("button", { name: /Conceder/i })).toBeNull();
  });

  it("locks the live header: NO pass control inside it, half badge, 'Mitad · Turno' chip, coach accent, per-side scores, and the bottom-dock chip + sheet", async () => {
    stubMatch(fixtureDetail(liveMatch()));
    const { container } = render(<MatchView leagueId="l1" fixtureId="f1" />);
    await waitFor(() => expect(container.textContent).toContain("Mitad 1 · Turno 3"));

    const header = screen.getByTestId("rulebook-header");
    // MVT-3: the sticky header itself must NEVER carry the pass-turn control.
    expect(within(header).queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    expect(within(header).queryByText(/Turno Reavers/)).toBeNull();
    // MVT-3: the red "Dar el turno" button lives ONLY in the bottom dock. The
    // dock carries NO "Turno {team}" status label — the header's turn chip and
    // the active coach's "Tu turno" accent already carry the turn state.
    expect(screen.getByRole("button", { name: /Dar el turno/i })).toBeTruthy();
    expect(screen.queryByText("Turno Reavers")).toBeNull();
    expect(screen.getByText("1ª Parte")).toBeTruthy();
    expect(screen.getByText("Mitad 1 · Turno 3")).toBeTruthy();
    // Concept B (MVT-3): per-side frozen/"live" scores under the acronyms + the
    // coach-only header accent "Tu turno · clock" (plain text, never role=status).
    expect(screen.getByTestId("score-home").textContent).toBe("1");
    expect(screen.getByTestId("score-away").textContent).toBe("0");
    expect(within(header).getByText(/Tu turno/)).toBeTruthy();
    // The former "En juego · Tiempo" mini-line is REMOVED (the count-up covers).
    expect(screen.queryByText(/En juego · Tiempo/)).toBeNull();
    // No composed "live-score" node survives — the score is per-side now.
    expect(screen.queryByTestId("live-score")).toBeNull();
    expect(screen.getByText("Clima · Estándar")).toBeTruthy();
    // RAU-38: the live header turn zone still carries the concede control (it is
    // NOT a pass control — it stays in the header turn area per RAU-38).
    expect(screen.getByRole("button", { name: "Conceder" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// D. MatchTimelineBar
// ---------------------------------------------------------------------------

describe("D. MatchTimelineBar — light track, always-on markers, chips, no endHalf", () => {
  const barEvents: LiveMatchView["events"] = [
    { seq: 1, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, at: 60_000 },
    { seq: 2, kind: "completion", side: "away", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, at: 120_000 },
    { seq: 3, kind: "endHalf", side: null, playerRosterId: null, half: 1, turnNumber: 8, payload: {}, at: 180_000 },
  ];

  it("renders the light track with always-on start/end markers and boundary labels (live, no finish needed)", () => {
    const { container } = render(
      <MatchTimelineBar events={barEvents} startedAt={0} finishedAt={null} homeTeam={homeTeam} awayTeam={awayTeam} />,
    );
    const bar = container.querySelector("[data-testid='match-timeline']") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.className).toContain("bg-background");
    expect(bar.getAttribute("role")).toBe("img");
    expect(bar.getAttribute("aria-label")).toBe("Línea de tiempo del partido");
    const start = container.querySelector("[data-testid='timeline-start-icon']") as HTMLElement;
    const end = container.querySelector("[data-testid='timeline-end-icon']") as HTMLElement;
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(start.style.left).toBe("0%");
    expect(end.style.left).toBe("100%");
    expect(start.title).toBe("Inicio del partido");
    expect(end.title).toBe("Fin del partido");
    expect(container.textContent).toContain("0'");
    // No finishedAt → the end bound is the LAST display event (120s → 2').
    expect(container.textContent).toContain("2'");
    expect(container.textContent).not.toContain("3'");
  });

  it("locks the icon chips as white circles with per-side borders (navy home / red away / mid gray)", () => {
    const { container } = render(
      <MatchTimelineBar events={barEvents} startedAt={0} finishedAt={null} homeTeam={homeTeam} awayTeam={awayTeam} />,
    );
    const home = container.querySelector("[data-testid='timeline-icon'][data-side='home']");
    const away = container.querySelector("[data-testid='timeline-icon'][data-side='away']");
    const start = container.querySelector("[data-testid='timeline-start-icon']");
    expect(home).toBeTruthy();
    expect(away).toBeTruthy();
    const chip = (el: Element) => el.firstElementChild as HTMLElement;
    const homeChip = chip(home!);
    const awayChip = chip(away!);
    const midChip = chip(start!);
    for (const c of [homeChip, awayChip, midChip]) {
      expect(c.className).toContain("rounded-full");
      expect(c.className).toContain("bg-panel");
      expect(c.className).toContain("h-5 w-5");
    }
    expect(homeChip.className).toContain("border-navy");
    expect(awayChip.className).toContain("border-red");
    expect(midChip.className).toContain("border-[#94a3b8]");
  });

  it("excludes endHalf from the bar and locks the tooltip format 'minute · label · player'", () => {
    const { container } = render(
      <MatchTimelineBar events={barEvents} startedAt={0} finishedAt={null} homeTeam={homeTeam} awayTeam={awayTeam} />,
    );
    const icons = Array.from(container.querySelectorAll("[data-testid='timeline-icon']"));
    // Only the two display events render — endHalf is never a displayed kind.
    expect(icons).toHaveLength(2);
    expect(container.textContent).not.toContain("Fin de la mitad");
    const td = container.querySelector("[data-testid='timeline-icon'][data-side='home']") as HTMLElement;
    expect(td.title).toBe("1' · Touchdown (1 - 0) · Blitzer A");
  });
});
