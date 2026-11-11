"use client";

import { useReducer } from "react";

import type { LiveMatchEventDto } from "./api";
import {
  actaDemoReducer,
  demoState,
  type DemoScenario,
} from "./actaDemoReducer";
import { ActaSheetHeader, bribesOf, casualtyTurnsOf } from "./actaSheetHeader";
import { ActaTurnTimeline } from "./actaTurnTimeline";
import { ActaClosure, canCloseActa } from "./actaClosure";
import { LiveActionDock } from "./liveActionDock";
import {
  MIN,
  league,
  liveState,
  matchDetail,
  narrativeEvents,
  viewer,
} from "./actaFlow.fixtures";

/**
 * Visual twin of the V2 live-acta flow, shared by the Storybook "Flujo
 * interactivo" story and the `/demo/partido` demo route. It MIRRORS the
 * layout of `MatchViewV2`'s `ActiveMatchBody` / `FinishedMatchBody`
 * (artboard 08) — when those change, keep this composition in sync.
 * Components here are the real ones, so design modifications show up
 * instantly. Mock ES data; the command pathway is a no-op (`onSubmit` never
 * POSTs).
 */
export function ActaFlow({
  state,
  nowMin = 58,
  closureOpen = false,
  events: eventsOverride,
}: {
  state: ReturnType<typeof liveState>;
  nowMin?: number;
  closureOpen?: boolean;
  /** Demo hook: overrides the fixture's events (the interactive harness). */
  events?: readonly LiveMatchEventDto[];
}) {
  const detail = matchDetail();
  const events = eventsOverride ?? detail.live?.events ?? [];
  const now = state.startedAt != null ? state.startedAt + nowMin * MIN : 0;
  const onSubmit = async () => undefined;
  const finished = state.status === "finished";

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
          }}
          away={{
            name: detail.awayTeam.name,
            score: state.awayScore,
            rerolls: league.teamRerolls?.[detail.awayTeam.id] ?? null,
            bribes: bribesOf(detail, "away"),
          }}
          weather={detail.result?.weather ?? null}
          casualtyTurns={casualtyTurnsOf(events, state.half)}
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
              onSubmit={onSubmit}
            />
            {/* Spacer so the fixed dock never covers the tail of the feed. */}
            <div aria-hidden className="h-20" />
          </>
        )}
      </div>
    </div>
  );
}

/** Demo controls: scenario jumps + event registration over the reducer. */
const SCENARIOS: ReadonlyArray<{ key: DemoScenario; label: string }> = [
  { key: "primer-tercio", label: "1T · turno 3" },
  { key: "segundo-tercio", label: "2T · turno 5" },
  { key: "finalizado", label: "Finalizado" },
];

/**
 * Interactive demo sandbox driven by the pure `actaDemoReducer` (no network).
 * Deterministic by design: no `Date.now()`, no `Math.random()` — snapshots
 * stay stable.
 */
export function ActaDemoHarness({
  label = "Demo · datos simulados",
}: {
  /** Banner text; the Storybook story keeps its own phase label. */
  label?: string;
}) {
  const [state, dispatch] = useReducer(
    actaDemoReducer,
    "segundo-tercio" as DemoScenario,
    demoState,
  );

  // Deterministic sample cycling (state-derived, never random) keeps the
  // composition — and its Chromatic snapshots — stable.
  const nextSample = (): LiveMatchEventDto => {
    const sample = narrativeEvents[state.events.length % narrativeEvents.length];
    return { ...sample, half: state.half, turnNumber: state.turnNumber };
  };

  const buttonClass =
    "rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-background";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy">
          {label}
        </p>
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
            onClick={() => dispatch({ type: "registerEvent", event: nextSample() })}
          >
            Registrar evento
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              dispatch({
                type: "registerEvent",
                event: nextSample(),
                score: { side: "home" },
              })
            }
          >
            TD local
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              dispatch({
                type: "registerEvent",
                event: nextSample(),
                score: { side: "away" },
              })
            }
          >
            TD visitante
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => dispatch({ type: "endTurn" })}
          >
            Fin de turno
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => dispatch({ type: "finish" })}
          >
            Finalizar partido
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => dispatch({ type: "openClosure" })}
          >
            Abrir cierre
          </button>
        </div>
      </div>
      <ActaFlow
        state={state}
        events={state.events}
        nowMin={state.status === "finished" ? 92 : 58}
        closureOpen={state.closureOpen}
      />
    </div>
  );
}
