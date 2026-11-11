import { ActaSheetHeader, bribesOf, casualtyTurnsOf } from "./actaSheetHeader";
import { ActaTurnTimeline } from "./actaTurnTimeline";
import { ActaClosure, canCloseActa } from "./actaClosure";
import { LiveActionDock } from "./liveActionDock";
import {
  BASE,
  MIN,
  league,
  liveState,
  matchDetail,
  narrativeEvents,
  viewer,
} from "./actaFlow.fixtures";

/**
 * Visual twin of the V2 live-acta flow. This story MIRRORS the layout of
 * `MatchViewV2`'s `ActiveMatchBody` / `FinishedMatchBody` (artboard 08) —
 * when those change, keep this composition in sync. Components here are the
 * real ones, so design modifications show up instantly. Mock ES data; the
 * command pathway is a no-op (`onSubmit` never POSTs).
 */

function Flow({
  state,
  nowMin = 58,
  closureOpen = false,
}: {
  state: ReturnType<typeof liveState>;
  nowMin?: number;
  closureOpen?: boolean;
}) {
  const detail = matchDetail();
  const events = detail.live?.events ?? [];
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

export default {
  title: "Acta en vivo/Flujo completo",
  component: Flow,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "El flujo del nuevo enfrentamiento (Acta en Vivo, artboard 08): cabecera + cronología " +
          "por turnos + dock rápido de captura, y el estado final con la superficie de cierre. " +
          "Espejo visual del `ActiveMatchBody`/`FinishedMatchBody` real; los componentes son los " +
          "de producción, así que cualquier modificación de diseño se ve aquí al instante. Los " +
          "botones del dock son interactivos (abren sus modales); los comandos no hacen POST.",
      },
    },
  },
};

export const EnVivoTurnoDelRival = {
  name: "En vivo — turno del rival (pedir turno)",
  render: () => <Flow state={liveState()} />,
};

export const EnVivoTurnoPropio = {
  name: "En vivo — turno propio (dock de captura)",
  render: () => (
    <Flow
      state={liveState({
        half: 1,
        turnNumber: 2,
        activeSide: "home",
        homeScore: 1,
        awayScore: 0,
        elapsed: 24 * MIN,
      })}
      nowMin={24}
    />
  ),
};

export const FinalizadoConCierre = {
  name: "Finalizado — cierre abierto",
  render: () => (
    <Flow
      state={liveState({
        status: "finished",
        half: 2,
        turnNumber: 8,
        homeScore: 2,
        awayScore: 1,
        elapsed: 92 * MIN,
        finishedAt: BASE + 92 * MIN,
      })}
      nowMin={92}
      closureOpen
    />
  ),
};
