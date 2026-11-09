"use client";

import { useI18n } from "@/lib/i18n";
import { getInducement } from "@/lib/rules/inducements";
import { weatherLabel, type SummaryTFunc } from "./matchSummary";
import type { LiveMatchEventDto, MatchDetail } from "./api";

/**
 * Acta en Vivo shell (MVA-1/MVA-2 + the MVA-3 turn-stepper half, T7 Slice A):
 * the TOP sections of `design/match-report-redesign/08-acta-en-vivo.html`,
 * data-bound on the V2 match surface:
 *   1. sticky top bar — running score line ("{home} {hs} - {as} {away}"
 *      condensed `font-display` shape) + menu button placeholder;
 *   2. subheader — live dot + "{league} • Jornada {n}" status line (S5: the
 *      league name comes from `league.name`, NEVER hardcoded), "Oficial" chip,
 *      per-team RR/bribes/score blocks, weather + referee line;
 *   3. horizontal T1-T8 turn stepper — done (✓), casualty-marked, active (+
 *      "TURNO N EN JUEGO" badge) and upcoming states.
 *
 * Tokens: existing rulebook-light tokens only (AGENTS.md rule 5) — the
 * artboard's `surface-*`/`on-primary`/`error-container` palette maps onto
 * `fill-hover`/`white`/`red` opacity variants. Icons: inline Material Symbols
 * paths copied from the artboard (no icon fonts, no dependencies). The turn
 * cards, injury-roll callout and capture dock are Slices B/C — not here.
 *
 * Copy note: design-specific labels ("Oficial", "TURNO N EN JUEGO", "RR:",
 * "Soborno:", "Árbitro:", "1ª Mitad") live as Spanish literals per the
 * match-section convention (AGENTS.md rule 6); dictionary-driven strings reuse
 * the existing `match.*` keys.
 */

/** BB2025: a half is 8 team-turn rounds (T1-T8 in the stepper). */
const TURNS_PER_HALF = 8;

/** One team's line in the subheader blocks + top-bar score. */
export interface ActaTeamLine {
  name: string;
  score: number;
  /** Purchased team rerolls (`coaching.rerolls`); `null` = not resolvable. */
  rerolls: number | null;
  /** Bribes ("Sobornos") recorded for the match (inducement cart/snapshot). */
  bribes: number;
}

export interface ActaSheetHeaderProps {
  /** `league.name` from data (S5) — undefined renders just the round. */
  leagueName?: string;
  round: number;
  status: "pending" | "ready" | "live" | "finished";
  half: number;
  turnNumber: number;
  home: ActaTeamLine;
  away: ActaTeamLine;
  /** BB2025 weather kind (result snapshot) or null before it is rolled. */
  weather: string | null;
  /** Turn numbers (current half) carrying a casualty event. */
  casualtyTurns: readonly number[];
}

export type ActaTurnState = "done" | "casualty" | "active" | "upcoming";

/**
 * The stepper state for one turn (MVA-3 stepper half): `active` only while the
 * match is live, `done` up to the reached turn once finished, `casualty`
 * supersedes `done` for rounds whose feed carries a casualty, the rest stay
 * `upcoming` (never invented as done).
 */
export function turnStateOf(
  turn: number,
  status: ActaSheetHeaderProps["status"],
  turnNumber: number,
  casualtyTurns: readonly number[],
): ActaTurnState {
  const casualty = casualtyTurns.includes(turn);
  if (status === "live") {
    if (turn === turnNumber) return "active";
    if (turn < turnNumber) return casualty ? "casualty" : "done";
    return "upcoming";
  }
  if (status === "finished") {
    if (turn <= turnNumber) return casualty ? "casualty" : "done";
    return "upcoming";
  }
  return "upcoming";
}

/** Unique, ascending turn numbers of the current half carrying a casualty. */
export function casualtyTurnsOf(
  events: readonly LiveMatchEventDto[],
  half: number,
): number[] {
  return [
    ...new Set(
      events
        .filter((event) => event.kind === "casualty" && event.half === half)
        .map((event) => event.turnNumber),
    ),
  ].sort((a, b) => a - b);
}

/**
 * Bribes ("Sobornos") for one side: the live inducement cart while the match
 * runs, the persisted result snapshot once reported, else 0 (never invented).
 */
export function bribesOf(
  detail: Pick<MatchDetail, "live" | "result">,
  side: "home" | "away",
): number {
  const cartItem = detail.live?.inducements?.[side]?.find((item) => item.id === "bribes");
  if (cartItem != null) return cartItem.count;
  const displayName = getInducement("bribes")?.displayName ?? "Sobornos";
  const card = detail.result?.scores[side].inducements?.cards.find(
    (entry) => entry.name === displayName || entry.name === "bribes",
  );
  return card?.count ?? 0;
}

/** Material Symbols path (960 grid) copied from artboard 08 — inline SVG only. */
const ICON_PATHS = {
  emblem:
    "M480-480ZM362-202 202-362q-3 38-1.5 79t7.5 73q23 7 69.5 9t84.5-1Zm96-16q59-13 106-37t82-59q34-34 58-80.5T742-500L500-742q-57 14-103 38.5T316-644q-35 35-59.5 81.5T218-458l240 240Zm-62-122-56-56 224-224 56 56-224 224Zm362-256q4-39 2.5-81t-8.5-73q-23-8-69.5-10t-84.5 2l160 162ZM310-120q-57 0-104-8.5T148-148q-11-12-19.5-60T120-314q0-119 36-220.5T258-702q66-66 169-102t223-36q58 0 104.5 8.5T812-812q11 12 19.5 60t8.5 108q0 117-36 218.5T702-258q-65 65-168 101.5T310-120Z",
  menu: "M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z",
  sun: "M440-800v-120h80v120h-80Zm0 760v-120h80v120h-80Zm360-400v-80h120v80H800Zm-760 0v-80h120v80H40Zm708-252-56-56 70-72 58 58-72 70ZM198-140l-58-58 72-70 56 56-70 72Zm564 0-70-72 56-56 72 70-58 58ZM212-692l-72-70 58-58 70 72-56 56Zm268 452q-100 0-170-70t-70-170q0-100 70-170t170-70q100 0 170 70t70 170q0 100-70 170t-170 70Zm0-80q67 0 113.5-46.5T640-480q0-67-46.5-113.5T480-640q-67 0-113.5 46.5T320-480q0 67 46.5 113.5T480-320Zm0-160Z",
  check: "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
} as const;

function ActaIcon({ name, className = "" }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 960 960" aria-hidden="true" focusable="false" className={className}>
      <path d={ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}

function TeamBlock({ team, tone }: { team: ActaTeamLine; tone: "navy" | "red" }) {
  return (
    <div
      className={`flex items-center justify-between rounded-sm border-l-2 bg-fill-hover p-2 ${
        tone === "navy" ? "border-l-navy" : "border-l-red"
      }`}
    >
      <div className="min-w-0">
        <span className="block truncate text-[10px] font-bold uppercase text-slate">{team.name}</span>
        <span className="text-[10px] font-medium text-slate-strong">
          RR: {team.rerolls ?? "—"} • Soborno: {team.bribes}
        </span>
      </div>
      <span className={`font-display text-2xl leading-none ${tone === "navy" ? "text-navy" : "text-red"}`}>
        {team.score}
      </span>
    </div>
  );
}

function TurnChip({
  turn,
  state,
}: {
  turn: number;
  state: ActaTurnState;
}) {
  const base = "flex h-8 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold";
  if (state === "done") {
    return (
      <li data-turn={turn} data-state={state} aria-label={`Turno ${turn}`} className={`${base} w-8 border border-border bg-fill-hover text-slate`}>
        <ActaIcon name="check" className="text-sm text-navy" />
      </li>
    );
  }
  if (state === "casualty") {
    return (
      <li
        data-turn={turn}
        data-state={state}
        aria-label={`Turno ${turn}`}
        className={`${base} relative w-8 flex-col border border-red/40 bg-red/10 text-red`}
      >
        <span>T{turn}</span>
        <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-panel bg-red" />
      </li>
    );
  }
  if (state === "active") {
    return (
      <li
        data-turn={turn}
        data-state={state}
        aria-label={`Turno ${turn}`}
        className={`${base} w-9 flex-col bg-navy text-white ring-2 ring-navy/20`}
      >
        <span>T{turn}</span>
        <span aria-hidden className="mt-0.5 h-1 w-1 rounded-full bg-white" />
      </li>
    );
  }
  return (
    <li
      data-turn={turn}
      data-state={state}
      aria-label={`Turno ${turn}`}
      className={`${base} w-8 border border-border bg-background text-slate opacity-60`}
    >
      <span>T{turn}</span>
    </li>
  );
}

export function ActaSheetHeader({
  leagueName,
  round,
  status,
  half,
  turnNumber,
  home,
  away,
  weather,
  casualtyTurns,
}: ActaSheetHeaderProps) {
  const { t } = useI18n();
  const live = status === "live";
  const statusLine = leagueName
    ? `${leagueName} • ${t("match.jornada", { round })}`
    : t("match.jornada", { round });
  const halfLabel = half === 2 ? "2ª Mitad" : "1ª Mitad";
  const weatherText = weather ? weatherLabel(weather, t as SummaryTFunc) : "Estándar";
  return (
    <>
      {/* 1. Sticky top bar (artboard: fixed app bar) — score line + menu. */}
      <header
        data-testid="ui-v2-match-header"
        className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-navy px-4 py-2 text-white shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ActaIcon name="emblem" className="h-5 w-5 shrink-0" />
          <h1 className="min-w-0 truncate font-display text-lg uppercase tracking-wider">
            {home.name} {home.score} - {away.score} {away.name}
          </h1>
        </span>
        <button
          type="button"
          aria-label="Abrir menú"
          className="shrink-0 rounded p-1 text-white transition-colors hover:bg-navy-hover"
        >
          <ActaIcon name="menu" className="text-xl" />
        </button>
      </header>

      {/* 2. Subheader — status line + team blocks + weather/referee line. */}
      <section data-testid="ui-v2-match-status" className="border-b border-border bg-panel px-4 py-2">
        <div className="flex items-center justify-between pb-1 text-slate">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2" data-live={live}>
              {live ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-75 motion-reduce:animate-none" />
              ) : null}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-red" : "bg-slate"}`} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink">{statusLine}</span>
          </span>
          <span className="rounded bg-fill-hover px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-strong">
            Oficial
          </span>
        </div>
        <div
          data-testid="ui-v2-match-score"
          className="mt-1 grid grid-cols-2 gap-2 border-t border-border pt-1.5"
        >
          <TeamBlock team={home} tone="navy" />
          <TeamBlock team={away} tone="red" />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[11px] text-slate">
          <span className="flex items-center gap-1">
            <ActaIcon name="sun" className="text-sm" />
            <span>
              {halfLabel} • Clima: <strong className="font-medium text-ink">{weatherText}</strong>
            </span>
          </span>
          <span className="font-medium text-ink">Árbitro: —</span>
        </div>
      </section>

      {/* 3. Horizontal turn stepper (MVA-3 half) — T1-T8, scrollable. */}
      <section
        data-testid="ui-v2-match-stepper"
        className="border-b border-border bg-panel px-4 py-2 shadow-sm"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[15px] uppercase tracking-wide text-ink">{halfLabel}</span>
          {live ? (
            <span className="flex items-center gap-1 rounded bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red motion-reduce:animate-none" />
              TURNO {turnNumber} EN JUEGO
            </span>
          ) : null}
        </div>
        <ol className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
          {Array.from({ length: TURNS_PER_HALF }, (_, index) => index + 1).map((turn) => (
            <TurnChip
              key={turn}
              turn={turn}
              state={turnStateOf(turn, status, turnNumber, casualtyTurns)}
            />
          ))}
        </ol>
      </section>
    </>
  );
}
