"use client";

import { useEffect, useReducer, useRef } from "react";

import type { LiveCommand, LiveMatchEventDto } from "./api";
import {
  actaDemoReducer,
  demoState,
  type ActaDemoState,
  type DemoScenario,
} from "./actaDemoReducer";
import { ActaSheetHeader, bribesOf, casualtyTurnsOf } from "./actaSheetHeader";
import { fanFactorOf, inducementsOf, latestWeather } from "./actaPreMatch";
import { turnSidesOf } from "./actaTurnSides";
import { ActaTurnTimeline } from "./actaTurnTimeline";
import { ActaClosure, canCloseActa } from "./actaClosure";
import { LiveActionDock } from "./liveActionDock";
import { MIN, league, liveState, matchDetail, viewer } from "./actaFlow.fixtures";

/**
 * Visual twin of the V2 live-acta flow, shared by the Storybook "Flujo
 * interactivo" story and the `/demo/partido` demo route. It MIRRORS the
 * layout of `MatchViewV2`'s `ActiveMatchBody` / `FinishedMatchBody`
 * (artboard 08) — when those change, keep this composition in sync.
 * Components here are the real ones, so design modifications show up
 * instantly. Mock ES data.
 *
 * `onSubmit` is the REAL capture pathway: the dock's guided modals and the
 * timeline's injury-roll callout fire complete `LiveCommand`s into it (the
 * demo harness feeds its reducer; the static stories keep the default no-op).
 * The detail's `live` block MIRRORS the rendered state/events so the closure
 * guards (`canCloseActa`) and its derived acta see the demo match exactly as
 * `MatchViewV2` sees the served one. `detail.result` is NEVER synthesized —
 * its consumers use unsafe optional chains.
 */
export function ActaFlow({
  state,
  nowMin = 58,
  closureOpen = false,
  events: eventsOverride,
  onSubmit = () => undefined,
}: {
  state: ReturnType<typeof liveState>;
  nowMin?: number;
  closureOpen?: boolean;
  /** Demo hook: overrides the fixture's events (the interactive harness). */
  events?: readonly LiveMatchEventDto[];
  /** The real command pathway (dock + timeline capture). Default: no-op. */
  onSubmit?: (cmd: LiveCommand) => Promise<void> | void;
}) {
  const fixture = matchDetail();
  const events = eventsOverride ?? fixture.live?.events ?? [];
  const detail = matchDetail({
    live: { ...state, events: [...events] },
  });
  const now = state.startedAt != null ? state.startedAt + nowMin * MIN : 0;
  const finished = state.status === "finished";
  const weatherNow = latestWeather(events, detail.result?.weather ?? null);

  return (
    <div className="w-full px-4 pb-32 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <ActaSheetHeader
          leagueName={league.name}
          round={detail.fixture.round}
          status={state.status}
          half={state.half}
          turnNumber={state.turnNumber}
          home={{
            name: detail.homeTeam.name,
            score: state.homeScore,
            rerolls: league.teamRerolls?.[detail.homeTeam.id] ?? null,
            bribes: bribesOf(detail, "home"),
            fanFactor: fanFactorOf(events, "home"),
            inducements: inducementsOf(detail, "home"),
          }}
          away={{
            name: detail.awayTeam.name,
            score: state.awayScore,
            rerolls: league.teamRerolls?.[detail.awayTeam.id] ?? null,
            bribes: bribesOf(detail, "away"),
            fanFactor: fanFactorOf(events, "away"),
            inducements: inducementsOf(detail, "away"),
          }}
          weather={weatherNow.value}
          weatherRoll={weatherNow.roll}
          casualtyTurns={casualtyTurnsOf(events, state.half)}
          turnSides={turnSidesOf(events, state.half, state)}
        />
        {events.length > 0 ? (
          <div className="bg-background">
            <ActaTurnTimeline
              events={events}
              homeTeam={detail.homeTeam}
              awayTeam={detail.awayTeam}
              startedAt={state.startedAt}
              now={now}
              active={state}
              viewerSide={state.viewerSide}
              {...(finished ? {} : { onSubmit })}
            />
          </div>
        ) : null}
        {finished ? (
          canCloseActa(detail, league, viewer) && closureOpen ? (
            <ActaClosure
              detail={detail}
              league={league}
              viewer={viewer}
              onClose={() => undefined}
              onSubmitted={async () => undefined}
            />
          ) : null
        ) : (
          <>
            {/* Mirrors ActiveMatchBody's request-turn row (t("match.requestTurn")). */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0" />
              <div className="flex flex-wrap gap-3">
                {state.viewerSide !== null &&
                state.viewerSide !== state.activeSide ? (
                  <button
                    type="button"
                    className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
                  >
                    Solicitar turno
                  </button>
                ) : null}
              </div>
            </div>
            <LiveActionDock
              variant="acta"
              viewerSide={state.viewerSide}
              activeSide={state.activeSide}
              status={state.status}
              roster={
                state.viewerSide === "away"
                  ? detail.awayTeam.players
                  : detail.homeTeam.players
              }
              opponentRoster={
                state.viewerSide === "away"
                  ? detail.homeTeam.players
                  : detail.awayTeam.players
              }
              rosterRaceId={
                state.viewerSide === "away"
                  ? detail.awayTeam.raceId
                  : detail.homeTeam.raceId
              }
              opponentRaceId={
                state.viewerSide === "away"
                  ? detail.homeTeam.raceId
                  : detail.awayTeam.raceId
              }
              onSubmit={async (cmd) => {
                await onSubmit(cmd);
              }}
            />
            {/* Spacer so the fixed dock never covers the tail of the feed. */}
            <div aria-hidden className="h-20" />
          </>
        )}
      </div>
    </div>
  );
}

/** Scenario quick-jumps + the flow buttons, all over the reducer. */
const SCENARIOS: ReadonlyArray<{ key: DemoScenario; label: string }> = [
  { key: "inicio", label: "Inicio" },
  { key: "primer-tercio", label: "1T · turno 3" },
  { key: "segundo-tercio", label: "2T · turno 5" },
  { key: "finalizado", label: "Finalizado" },
];

/** localStorage persistence: one versioned blob, `bb-demo-partido` v2. */
const STORAGE_KEY = "bb-demo-partido";
const STORAGE_VERSION = 2;

/**
 * Interactive DUAL-VIEW demo sandbox driven by the pure `actaDemoReducer`
 * (no network): two rival coach perspectives over ONE shared match state,
 * switched manually ("Ver como:") or auto-followed turn by turn ("Seguir al
 * turno activo"). The REAL `LiveActionDock`/timeline capture lands in the
 * reducer via `submitCommand`; the state persists to localStorage (v2) so an
 * iteration survives a reload, and "Restablecer" replays from the kickoff.
 * Deterministic by design: no `Date.now()`, no `Math.random()` — the fetch
 * shim and localStorage are runtime concerns only.
 */
export function ActaDemoHarness({
  label = "Demo · datos simulados",
}: {
  /** Banner text; the Storybook story keeps its own phase label. */
  label?: string;
}) {
  const [state, dispatch] = useReducer(actaDemoReducer, demoState("inicio"));
  const detail = matchDetail();

  // Pristine first-render state: the persistence effect below never rewrites
  // storage with it, so a saved match is always read before any write (Strict
  // Mode's setup→cleanup→setup effect re-run included) and a genuine no-op
  // action (reducer returns the same state object) is never saved.
  const initialStateRef = useRef(state);

  // Latest viewer side for the closure save shim (installed once on mount).
  const viewerSideRef = useRef(state.viewerSide);
  useEffect(() => {
    viewerSideRef.current = state.viewerSide;
  }, [state.viewerSide]);

  // 1) Hydrate a saved demo match — client-only (SSR never reads storage).
  // Version mismatch, parse failure or a foreign shape silently keeps the
  // initial state. MUST run before the persistence effect below.
  useEffect(() => {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as { v?: unknown; state?: unknown } | null;
      const saved = parsed?.state as Partial<ActaDemoState> | null | undefined;
      if (
        parsed?.v === STORAGE_VERSION &&
        saved != null &&
        Array.isArray(saved.events) &&
        typeof saved.status === "string"
      ) {
        dispatch({ type: "hydrate", saved: saved as ActaDemoState });
      }
    } catch {
      // Corrupt or unavailable storage: keep the initial state.
    }
  }, []);

  // 2) Persist every state change as `{ v: 2, state }` (the pristine initial
  // state is never written — see `initialStateRef`).
  useEffect(() => {
    if (state === initialStateRef.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: STORAGE_VERSION, state }),
      );
    } catch {
      // Storage full/unavailable: the demo keeps working in memory.
    }
  }, [state]);

  // 3) DEMO-ONLY save shim: the real closure form's `submitResult` POSTs
  // /api/leagues/{leagueId}/fixtures/{fixtureId}/result. For the DEMO fixture
  // that request resolves here with a 200 `{ status: "played" }` (ActaClosure
  // only awaits the outcome — `readJson` needs `ok` + parseable JSON) and
  // never hits the network. The interception is also the seam that records
  // the single acta submitter (`submitClosure`, V2 has no handshake) so the
  // chrome can hide the closure — mirroring MatchViewV2 hiding it once
  // `detail.result` exists. Every other request passes through untouched; the
  // original fetch is restored on unmount.
  useEffect(() => {
    const demoFixture = matchDetail().fixture;
    const demoUrl = `/api/leagues/${encodeURIComponent(demoFixture.leagueId)}/fixtures/${encodeURIComponent(demoFixture.id)}/result`;
    const original = window.fetch;
    window.fetch = (input, init): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const requestMethod =
        typeof input === "string" ? undefined : "method" in input ? input.method : undefined;
      const method = (init?.method ?? requestMethod ?? "GET").toUpperCase();
      if (method === "POST" && url === demoUrl) {
        dispatch({
          type: "submitClosure",
          side: viewerSideRef.current ?? "home",
        });
        return Promise.resolve(
          Response.json({ status: "played" }, { status: 200 }),
        );
      }
      return original.call(window, input, init);
    };
    return () => {
      window.fetch = original;
    };
  }, [dispatch]);

  const buttonClass =
    "rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-background";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy">
          {label}
        </p>

        {/* Dual-view perspective: the two REAL rival coaches over one state. */}
        <div
          role="group"
          aria-label="Ver como:"
          className="flex items-center gap-2"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate">
            Ver como:
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-navy">
            <button
              type="button"
              aria-pressed={state.viewerSide === "home"}
              onClick={() =>
                dispatch({ type: "switchPerspective", side: "home" })
              }
              className={`px-3 py-1.5 text-sm font-semibold ${
                state.viewerSide === "home"
                  ? "bg-navy text-white"
                  : "text-navy hover:bg-background"
              }`}
            >
              {detail.homeTeam.name}
            </button>
            <button
              type="button"
              aria-pressed={state.viewerSide === "away"}
              onClick={() =>
                dispatch({ type: "switchPerspective", side: "away" })
              }
              className={`px-3 py-1.5 text-sm font-semibold ${
                state.viewerSide === "away"
                  ? "bg-navy text-white"
                  : "text-navy hover:bg-background"
              }`}
            >
              {detail.awayTeam.name}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            checked={state.autoFollow}
            onChange={(event) =>
              dispatch({ type: "setAutoFollow", on: event.target.checked })
            }
            className="size-4 accent-navy"
          />
          Seguir al turno activo
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Escenario">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={buttonClass}
              onClick={() => dispatch({ type: "reset", scenario: s.key })}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones">
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              dispatch({
                type: "submitCommand",
                command: { type: "endTurn", side: state.activeSide },
              })
            }
          >
            Fin de turno
          </button>
          {state.status === "live" ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => dispatch({ type: "finish" })}
            >
              Finalizar partido
            </button>
          ) : null}
          {state.status === "finished" &&
          !state.closureOpen &&
          state.submittedBy == null ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => dispatch({ type: "openClosure" })}
            >
              Abrir cierre
            </button>
          ) : null}
          <button
            type="button"
            className={buttonClass}
            onClick={() => dispatch({ type: "reset", scenario: "inicio" })}
          >
            Restablecer
          </button>
        </div>

        {/* Single-submitter banner (acta V2: no two-sided handshake) — parent
            gating mirroring MatchViewV2, which drops its closure banner once
            `detail.result` exists (the demo never synthesizes a result). */}
        {state.submittedBy != null ? (
          <p
            role="status"
            className="rounded-md border border-red px-3 py-1.5 text-xs font-semibold text-red"
          >
            Resultado reportado por{" "}
            {state.submittedBy === "home"
              ? detail.homeTeam.name
              : detail.awayTeam.name}
          </p>
        ) : null}
      </div>
      <ActaFlow
        state={state}
        events={state.events}
        nowMin={state.status === "finished" ? 92 : 58}
        closureOpen={state.closureOpen && state.submittedBy == null}
        onSubmit={(cmd) => dispatch({ type: "submitCommand", command: cmd })}
      />
    </div>
  );
}
