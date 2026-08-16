import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { LiveEventCards } from "./liveEventCards";
import { MatchTimelineBar } from "./matchTimelineBar";
import { MatchView } from "./MatchView";
import { EVENT_GLYPH } from "./liveEventLabels";
import type { LiveMatchEventDto, LiveMatchView, MatchDetail, MatchTeamDetail } from "./api";

/**
 * DESIGN-LOCK suite: the user validated the Tourplay v7 design (event cards,
 * sticky header, light timeline) on `fix/rau-35-39-design`. These tests lock
 * TODAY's output so any future drift (class rename, gradient change, removed
 * corner, skipped icon, duplicated page header, emoji glyph replacing an SVG)
 * fails the suite. TEST-ONLY: no production file is touched.
 *
 * A  — `liveEventCards.module.css` is read as a raw string and the exact
 *       validated declarations are asserted (deleting/changing one fails).
 * B  — rendered card structure per kind (TD / casualty / foul / turnStart /
 *       expensive_mistake / fan_factor / start·endMatch) + the icon set.
 * C  — the Tourplay sticky header via a stubbed MatchView (back arrow, no
 *       duplicated page header, TURNO button, half badge, hero mini-line).
 * D  — MatchTimelineBar (light track, always-on boundary markers, chips).
 */

// ---------------------------------------------------------------------------
// A. Raw CSS module lock
// ---------------------------------------------------------------------------

const css = readFileSync(path.join(__dirname, "liveEventCards.module.css"), "utf8");

/** Extracts a single rule block (verbatim inner text) or throws with a hint. */
function block(pattern: RegExp, label: string): string {
  const m = pattern.exec(css);
  if (!m) throw new Error(`design-lock: the CSS module no longer contains the "${label}" rule`);
  return m[1];
}

/** Like `block` but takes the LAST match — needed because `.ev--away {` also
 * appears as the grouped selector `.ev--home,\n.ev--away {`. */
function lastBlock(pattern: RegExp, label: string): string {
  const global = pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const matches = [...css.matchAll(global)];
  if (matches.length === 0) throw new Error(`design-lock: the CSS module no longer contains the "${label}" rule`);
  return matches[matches.length - 1][1];
}

const homeAway = block(/\.ev--home,\s*\.ev--away\s*\{([\s\S]*?)\}/, ".ev--home, .ev--away");
const home = block(/\.ev--home\s*\{([\s\S]*?)\}/, ".ev--home");
const away = lastBlock(/\.ev--away\s*\{([\s\S]*?)\}/, ".ev--away");
const evBase = block(/\.ev\s*\{([\s\S]*?)\}/, ".ev");
const token = block(/\.token\s*\{([\s\S]*?)\}/, ".token");
const dorsal = block(/\.dorsal\s*\{([\s\S]*?)\}/, ".dorsal");
const dline = block(/\.detail\s+\.dline\s*\{([\s\S]*?)\}/, ".detail .dline");
const stars = block(/\.detail\s+\.stars\s*\{([\s\S]*?)\}/, ".detail .stars");
const vtoken = block(/\.vtoken\s*\{([\s\S]*?)\}/, ".vtoken");
const center = block(/\.ev--center\s*\{([\s\S]*?)\}/, ".ev--center");

describe("A. liveEventCards.module.css — validated v7 declarations", () => {
  it("locks the 68% team-card grid (auto 1fr auto, 8px column gap, mirrored align-self)", () => {
    expect(homeAway).toContain("width: 68%;");
    expect(homeAway).toContain("max-width: 68%;");
    expect(homeAway).toContain("grid-template-columns: auto 1fr auto;");
    expect(homeAway).toContain("grid-template-rows: auto 1fr auto;");
    expect(homeAway).toContain("gap: 0 8px;");
    expect(home).toContain("align-self: flex-start;");
    expect(away).toContain("align-self: flex-end;");
  });

  it("locks the home (navy) gradient and its exact grid areas", () => {
    expect(home).toContain(
      "background: linear-gradient(90deg, rgba(18, 34, 90, .12), rgba(255, 255, 255, 0) 45%), #fff;",
    );
    expect(home).toContain(
      'grid-template-areas:\n    "tag   body  ."\n    "tag   body  ."\n    ".     body  min";',
    );
  });

  it("locks the away (red) gradient and its mirrored grid areas", () => {
    expect(away).toContain(
      "background: linear-gradient(270deg, rgba(209, 25, 56, .12), rgba(255, 255, 255, 0) 45%), #fff;",
    );
    expect(away).toContain(
      'grid-template-areas:\n    ".     body  tag"\n    ".     body  tag"\n    "min   body  .";',
    );
  });

  it("locks the component sizes: token 30px/7px, dorsal 24px/900, stars #b8860b, dline 800, vtoken 16px, center 100%", () => {
    expect(token).toContain("flex: 0 0 30px;");
    expect(token).toContain("width: 30px;");
    expect(token).toContain("height: 30px;");
    expect(token).toContain("border-radius: 7px;");
    expect(dorsal).toContain("flex: 0 0 24px;");
    expect(dorsal).toContain("font-weight: 900;");
    expect(stars).toContain("color: #b8860b;");
    expect(dline).toContain("font-weight: 800;");
    expect(vtoken).toContain("width: 16px;");
    expect(vtoken).toContain("height: 16px;");
    expect(center).toContain("width: 100%;");
    expect(center).toContain("display: flex;");
  });

  it("locks the card base (.ev): radius 4px, soft shadow, 6px 10px padding", () => {
    expect(evBase).toContain("background: #fff;");
    expect(evBase).toContain("border-radius: 4px;");
    expect(evBase).toContain("box-shadow: 0 1px 2px rgba(15, 23, 42, .05);");
    expect(evBase).toContain("padding: 6px 10px;");
  });
});

// ---------------------------------------------------------------------------
// B. Rendered card structure per kind
// ---------------------------------------------------------------------------

/** The validated MDI path data (verbatim from `./icons.tsx`) for the icons the
 * design locks on: the casualty band trio, the money bag, football, timer, flag. */
const GRAVE_PATH =
  "M10,2H14C17.31,2 19,4.69 19,8V18.66C16.88,17.63 15.07,17 12,17C8.93,17 7.12,17.63 5,18.66V8C5,4.69 6.69,2 10,2M8,8V9.5H16V8H8M9,12V13.5H15V12H9M3,22V21.31C5.66,19.62 13.23,15.84 21,21.25V22H3Z";
const HELMET_PATH =
  "M13.5,12A1.5,1.5 0 0,0 12,13.5A1.5,1.5 0 0,0 13.5,15A1.5,1.5 0 0,0 15,13.5A1.5,1.5 0 0,0 13.5,12M13.5,3C18.19,3 22,6.58 22,11C22,12.62 22,14 21.09,16C17,16 16,20 12.5,20C10.32,20 9.27,18.28 9.05,16H9L8.24,16L6.96,20.3C6.81,20.79 6.33,21.08 5.84,21H3A1,1 0 0,1 2,20A1,1 0 0,1 3,19V16A1,1 0 0,1 2,15A1,1 0 0,1 3,14H6.75L7.23,12.39C6.72,12.14 6.13,12 5.5,12H5.07L5,11C5,6.58 8.81,3 13.5,3M5,16V19H5.26L6.15,16H5Z";
const HOSPITAL_PATH =
  "M18,14H14V18H10V14H6V10H10V6H14V10H18M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";
const MONEY_BAG_PATH =
  "M16,9C20,11 21,18 21,18C21,18 22,22 16,22C10,22 8,22 8,22C2,22 3,18 3,18C3,18 4,11 8,9M14,4L12,2L10,4L6,2L8,7H16L18,2L14,4Z";
const FOOTBALL_PATH =
  "M8.39 21L3 15.61C3 16.7 3.04 17.71 3.2 18.63C3.35 19.55 3.5 20.1 3.71 20.29C3.9 20.5 4.44 20.65 5.35 20.81S7.27 21 8.39 21M15.5 9.89L9.89 15.5L8.5 14.11L14.11 8.5L15.5 9.89M3.29 13.08L10.92 20.71C13.7 20.21 15.9 19.15 17.53 17.53C19.15 15.9 20.21 13.7 20.71 10.92L13.08 3.29C10.3 3.79 8.1 4.85 6.47 6.47S3.79 10.3 3.29 13.08M15.61 3L21 8.39C21 7.3 20.96 6.29 20.81 5.37C20.65 4.45 20.5 3.9 20.29 3.71C20.1 3.5 19.56 3.35 18.65 3.2S16.73 3 15.61 3Z";
const TIMER_PATH =
  "M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z";
const FLAG_PATH =
  "M14.4,6H20V16H13L12.6,14H7V21H5V4H14L14.4,6M14,14H16V12H18V10H16V8H14V10L13,8V6H11V8H9V6H7V8H9V10H7V12H9V10H11V12H13V10L14,12V14M11,10V8H13V10H11M14,10H16V12H14V10Z";
const FLAG_VARIANT_PATH =
  "M6,3A1,1 0 0,1 7,4V4.88C8.06,4.31 9.5,4 11,4C14,4 14,6 16,6C19,6 20,4 20,4V12C20,12 19,14 16,14C13,14 13,12 11,12C8,12 7,14 7,14V21H5V4A1,1 0 0,1 6,3Z";

function player(id: string, name: string, positionalKey = "blitzer") {
  return { rosterPlayerId: id, name, positionalKey, pe: 0, skills: {}, injuries: {}, alive: true, valueBonus: 0 };
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
  return render(<LiveEventCards events={events} startedAt={1000} homeTeam={homeTeam} awayTeam={awayTeam} />);
}

describe("B. LiveEventCards — validated v7 rendered structure", () => {
  it("locks the feed container shell (gray box, 1px border, 12px/14px padding, 2px gaps)", () => {
    const { container } = renderCards([ev(1, "td", "home", {}, "p1", 3, 2000)]);
    const ol = container.querySelector("ol");
    const cls = ol?.getAttribute("class") ?? "";
    expect(ol).toBeTruthy();
    expect(ol?.getAttribute("aria-label")).toBe("Cronología del partido");
    expect(cls).toContain("bg-[#eef1f6]");
    expect(cls).toContain("border border-[#e2e8f0]");
    expect(cls).toContain("px-[14px] py-[12px]");
    expect(cls).toContain("gap-[2px]");
  });

  it("locks the home TD card: ev--home, T-turn tag, minute, 30px token, dorsal, dline--home, partial score", () => {
    const { container } = renderCards([ev(5, "td", "home", {}, "p1", 4, 241000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.className).toContain("ev--home");
    const tag = row.querySelector(".turn-tag") as HTMLElement;
    expect(tag.className).toContain("turn-tag--home");
    expect(tag.textContent).toBe("T4");
    expect(row.querySelector(".minute")?.textContent).toBe("4'");
    const tk = row.querySelector(".token") as HTMLElement;
    expect(tk.className).toContain("token--home");
    expect(tk.querySelector("svg")).toBeTruthy();
    expect(row.querySelector(".dorsal")?.textContent).toBe("#1");
    expect(row.querySelector(".name")?.textContent).toBe("Blitzer A");
    expect(row.querySelector(".pos")?.textContent).toBe("Blitzer");
    const line = row.querySelector(".dline") as HTMLElement;
    expect(line.className).toContain("dline--home");
    expect(line.querySelector(".dicon svg path")?.getAttribute("d")).toBe(FOOTBALL_PATH);
    expect(line.textContent).toContain("Touchdown");
    expect(line.textContent).toContain("(★3)");
    expect(row.querySelector(".score-note")?.textContent).toBe("(1 - 0)");
  });

  it("locks the away TD mirror: ev--away, red tag/token, dline--away, both corners present", () => {
    const { container } = renderCards([ev(6, "td", "away", {}, "p2", 5, 241000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--away");
    const tag = row.querySelector(".turn-tag") as HTMLElement;
    expect(tag.className).toContain("turn-tag--away");
    expect(tag.textContent).toBe("T5");
    expect(row.querySelector(".minute")).toBeTruthy();
    expect(row.querySelector(".minute")?.textContent).toBe("4'");
    expect(row.querySelector(".token")?.className).toContain("token--away");
    expect(row.querySelector(".dline")?.className).toContain("dline--away");
  });

  it("locks the casualty band sub-lines + the band icon trio (grave/helmet/hospital) under the dline", () => {
    const { container } = renderCards([
      ev(9, "casualty", "home", { band: "dead" }, "p1", 6, 2000),
      ev(10, "casualty", "home", { band: "grave" }, "p1", 6, 2100),
      ev(11, "casualty", "home", { band: "bruise" }, "p1", 6, 2200),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const dead = rows.find((li) => li.textContent?.includes("¡Muerto!"));
    const lasting = rows.find((li) => li.textContent?.includes("Se pierde el próximo partido"));
    const bruise = rows.find((li) => li.textContent?.includes("Lesión molesta"));
    expect(dead).toBeTruthy();
    expect(lasting).toBeTruthy();
    expect(bruise).toBeTruthy();
    // Newest-first ordering: bruise (11), lasting (10), dead (9).
    expect(rows[0].textContent).toContain("Herida");
    expect(rows[1].textContent).toContain("Baja");
    expect(rows[2].textContent).toContain("Baja");
    // The band sub-line renders right under the dline inside the detail column.
    const detail = dead!.querySelector(".detail");
    expect(detail?.firstElementChild?.classList.contains("dline")).toBe(true);
    expect(detail?.children[1]?.classList.contains("sub")).toBe(true);
    // The casualty icon varies by band: grave (dead), helmet (lasting), hospital (bruise).
    expect(dead!.querySelector(".dicon svg path")?.getAttribute("d")).toBe(GRAVE_PATH);
    expect(lasting!.querySelector(".dicon svg path")?.getAttribute("d")).toBe(HELMET_PATH);
    expect(bruise!.querySelector(".dicon svg path")?.getAttribute("d")).toBe(HOSPITAL_PATH);
  });

  it("locks the foul victim line (mini vtoken + 'a {name} (#{dorsal})') and the casualty cause line with the causer bolded", () => {
    const { container } = renderCards([
      ev(8, "foul", "home", { victimRosterId: "p8" }, "p1", 3, 2000),
      ev(9, "casualty", "away", { band: "grave", cause: "blitz", causerRosterId: "p4" }, "p2", 6, 3000),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const foul = rows.find((li) => li.textContent?.includes("Falta"));
    const casualty = rows.find((li) => li.textContent?.includes("Baja"));
    expect(foul).toBeTruthy();
    expect(casualty).toBeTruthy();
    // Foul: the victim is an OPPONENT (LM-12) — mini token with the rival tint.
    const victimLine = foul!.querySelector(".victim-line");
    expect(victimLine?.querySelector(".vtoken")).toBeTruthy();
    expect(victimLine?.querySelector(".vtoken")?.className).toContain("vtoken--away");
    expect(victimLine?.querySelector(".vtoken svg")).toBeTruthy();
    expect(victimLine?.textContent).toContain("a Trash (#2)");
    // Casualty: "por {causer} (#{dorsal}) · {cause}" with the causer in <b>.
    const causeLine = casualty!.querySelector(".cause-line");
    expect(causeLine?.textContent).toBe("por Arnau (#2) · Blitz");
    expect(causeLine?.querySelector("b")?.textContent).toBe("Arnau");
  });

  it("locks turnStart as a team card ('Turno {team}', no dorsal) and skips the generic 'turn' row", () => {
    const { container } = renderCards([
      ev(4, "turnStart", "home", {}, null, 4, 4000),
      ev(5, "turn", null, {}, null, 4, 4100),
      ev(6, "td", "home", {}, "p1", 4, 4200),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    // Only the turnStart + TD survive — the "Fin de turno" noise is skipped.
    expect(rows).toHaveLength(2);
    expect(container.textContent).not.toContain("Fin de turno");
    const turnStart = rows.find((li) => li.textContent?.includes("Empieza el turno"));
    expect(turnStart).toBeTruthy();
    expect(turnStart!.className).toContain("ev--home");
    expect(turnStart!.textContent).toContain("Turno Reavers");
    expect(turnStart!.textContent).not.toContain("Tu turno");
    expect(turnStart!.querySelector(".dorsal")).toBeNull();
    expect(turnStart!.querySelector(".token")).toBeTruthy();
    expect(turnStart!.querySelector(".token svg")).toBeTruthy();
    expect(turnStart!.querySelector(".name")?.textContent).toBe("Turno Reavers");
    expect(turnStart!.querySelector(".pos")?.textContent).toBe("Empieza el turno");
  });

  it("locks the expensive_mistake team card: no corners, money-bag icon, outcome label, es-ES treasury line", () => {
    const { container } = renderCards([
      ev(
        6,
        "expensive_mistake",
        "home",
        { outcome: "serious-incident", treasuryBefore: 234000, treasuryAfter: 214000 },
        null,
        1,
        1000,
      ),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--home");
    expect(row.querySelector(".turn-tag")).toBeNull();
    expect(row.querySelector(".minute")).toBeNull();
    const kcicon = row.querySelector(".kcicon") as HTMLElement;
    expect(kcicon.className).toContain("kcicon--home");
    expect(kcicon.querySelector("svg path")?.getAttribute("d")).toBe(MONEY_BAG_PATH);
    expect(row.querySelector(".ktitle")?.textContent).toBe("Error costoso");
    expect(row.querySelector(".ksub")?.textContent).toBe("Reavers · Incidente grave");
    expect(row.querySelector(".ktreasury")?.textContent).toBe("234.000 → 214.000 M.O.");
  });

  it("locks the fan_factor centered row with the exact per-team totals copy", () => {
    const { container } = renderCards([
      ev(7, "fan_factor", null, { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } }, null, 1, 1000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--center");
    expect(row.querySelector(".ctitle")?.textContent).toBe("Factor de aficionados");
    expect(row.querySelector(".ff-line")?.textContent).toBe("Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4");
    expect(row.querySelector(".cicon svg")).toBeTruthy();
  });

  it("locks the start / endMatch centered rows with the timer/flag icons and the wall-clock sub", () => {
    const { container } = renderCards([
      ev(1, "start", null, {}, null, 1, 1000),
      ev(2, "endMatch", null, {}, null, 8, 481000),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const start = rows.find((li) => li.textContent?.includes("Inicio del partido"));
    const end = rows.find((li) => li.textContent?.includes("Fin del partido"));
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(start!.className).toContain("ev--center");
    expect(start!.querySelector(".cicon svg path")?.getAttribute("d")).toBe(TIMER_PATH);
    expect(start!.querySelector(".ctitle")?.textContent).toBe("Inicio del partido");
    expect(start!.querySelector(".csub")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(start!.querySelector(".cright")).toBeNull();
    expect(end!.querySelector(".cicon svg path")?.getAttribute("d")).toBe(FLAG_PATH);
    expect(end!.querySelector(".ctitle")?.textContent).toBe("Fin del partido");
    expect(end!.querySelector(".csub")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(end!.querySelector(".cright")?.textContent).toBe("8'");
  });

  it("locks the concede centered row: white-flag glyph, 'Concesión', surrender·victory sub-line", () => {
    const { container } = renderCards([
      ev(9, "concede", "home", { winnerSide: "away" }, null, 3, 4000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--center");
    expect(row.querySelector(".cicon svg path")?.getAttribute("d")).toBe(FLAG_VARIANT_PATH);
    expect(row.querySelector(".ctitle")?.textContent).toBe("Concesión");
    expect(row.querySelector(".csub")?.textContent).toBe("Reavers se rinde · Victoria de Dwarves");
    expect(row.querySelector(".cright")).toBeNull();
  });

  it("locks the icon set: EVENT_GLYPH values are icon names and every icon area renders an inline <svg> (no emoji glyphs)", () => {
    const { container } = renderCards([
      ev(1, "start", null, {}, null, 1, 1000),
      ev(2, "td", "home", {}, "p1", 3, 2000),
      ev(3, "casualty", "away", { band: "dead" }, "p2", 4, 3000),
      ev(4, "foul", "home", { victimRosterId: "p8" }, "p1", 3, 4000),
      ev(5, "expensive_mistake", "home", { outcome: "catastrophe", treasuryBefore: 234000, treasuryAfter: 214000 }, null, 1, 1000),
      ev(6, "fan_factor", null, { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } }, null, 1, 1000),
      ev(7, "turnStart", "away", {}, null, 5, 5000),
    ]);
    // Icon-name lock: every EVENT_GLYPH entry is a kebab-case icon name, never an emoji.
    expect(Object.values(EVENT_GLYPH).every((v) => /^[a-z][a-z-]*$/.test(v))).toBe(true);
    expect(Object.values(EVENT_GLYPH).every((v) => !/\p{Extended_Pictographic}/u.test(v))).toBe(true);
    // Rendered lock: every icon area (.token/.dicon/.cicon/.kcicon/.vtoken) is
    // an inline SVG with empty text — an emoji glyph replacing it fails here.
    const iconAreas = container.querySelectorAll(".token, .dicon, .cicon, .kcicon, .vtoken");
    expect(iconAreas.length).toBeGreaterThan(0);
    iconAreas.forEach((el) => {
      expect(el.querySelector("svg")).toBeTruthy();
      expect(el.textContent).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// C. Tourplay sticky header via a stubbed MatchView
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

describe("C. Tourplay sticky header (MatchView)", () => {
  it("locks the finished-live header: back arrow, no duplicated page header, meta row, frozen score, no turn controls", async () => {
    stubMatch(fixtureDetail(finishedLive()));
    const { container } = render(<MatchView leagueId="l1" fixtureId="f1" />);
    await waitFor(() => expect(container.textContent).toContain("Fin del partido"));

    const header = screen.getByTestId("tourplay-header");
    expect(header).toBeTruthy();
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("z-40");
    expect(header.className).toContain("bg-[#12225a]");
    // The v7 back navigation lives ONLY in the sticky header (one Volver link).
    const back = within(header).getByRole("link", { name: "Volver a la jornada" });
    expect(back.getAttribute("href")).toBe("/leagues/l1");
    expect(screen.getAllByRole("link", { name: /Volver/i })).toHaveLength(1);
    // The duplicated "Partido {round}" page header is GONE (no heading above it).
    expect(screen.queryByRole("heading", { name: /Partido 1/ })).toBeNull();
    // Meta row + frozen hero score + half/turn note; the live mini-line is absent.
    expect(screen.getByText("Clima · Estándar")).toBeTruthy();
    expect(screen.getByText("Estadio · Reglamentario")).toBeTruthy();
    expect(screen.getByTestId("live-score").textContent).toMatch(/2\s*:\s*1/);
    expect(screen.getByText("2ª Parte")).toBeTruthy();
    expect(screen.getByText("Mitad 2 · Turno 8")).toBeTruthy();
    expect(screen.queryByText(/En juego · Tiempo/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    expect(screen.queryByText("Turno Reavers")).toBeNull();
    // RAU-38: a finished match shows no concede control.
    expect(screen.queryByRole("button", { name: /Conceder/i })).toBeNull();
  });

  it("locks the live header: TURNO button + 'Turno {team}', half badge, 'Mitad · Turno' line and the hero mini-line", async () => {
    stubMatch(fixtureDetail(liveMatch()));
    const { container } = render(<MatchView leagueId="l1" fixtureId="f1" />);
    await waitFor(() => expect(container.textContent).toContain("Mitad 1 · Turno 3"));

    expect(screen.getByRole("button", { name: /Dar el turno/i })).toBeTruthy();
    expect(screen.getByText("Turno Reavers")).toBeTruthy();
    expect(screen.getByText("1ª Parte")).toBeTruthy();
    expect(screen.getByText("Mitad 1 · Turno 3")).toBeTruthy();
    expect(screen.getByTestId("live-score").textContent).toMatch(/1\s*:\s*0/);
    expect(screen.getByText(/En juego · Tiempo/)).toBeTruthy();
    expect(screen.getByText("Clima · Estándar")).toBeTruthy();
    // RAU-38: the live header turn zone carries the concede control for a coach.
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
    expect(bar.className).toContain("bg-[#f8fafc]");
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
      expect(c.className).toContain("bg-white");
      expect(c.className).toContain("h-5 w-5");
    }
    expect(homeChip.className).toContain("border-[#12225a]");
    expect(awayChip.className).toContain("border-[#d11938]");
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
