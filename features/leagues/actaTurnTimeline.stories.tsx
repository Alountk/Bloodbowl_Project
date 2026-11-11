import { ActaTurnTimeline } from "./actaTurnTimeline";
import {
  BASE,
  MIN,
  awayTeam,
  homeTeam,
  liveState,
  narrativeEvents,
} from "./actaFlow.fixtures";

/**
 * Per-turn acta timeline (MVA-3/MVA-4): turn cards over the feed with the
 * roll action on the active turn. `onSubmit` optional — omitted renders the
 * read-only (finished) variant. Mock ES data, no network.
 */

function Timeline({
  status,
  half,
  turnNumber,
  activeSide,
  viewerSide,
  onSubmit,
  nowMin = 58,
}: {
  status: "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  viewerSide: "home" | "away" | null;
  onSubmit?: () => Promise<void>;
  nowMin?: number;
}) {
  return (
    <div className="flex justify-center bg-background p-2">
      <div className="w-full max-w-2xl">
        <ActaTurnTimeline
          events={narrativeEvents}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          startedAt={BASE}
          now={BASE + nowMin * MIN}
          active={{ status, half, turnNumber, activeSide }}
          viewerSide={viewerSide}
          {...(onSubmit ? { onSubmit } : {})}
        />
      </div>
    </div>
  );
}

export default {
  title: "Partido/New Styles/Timeline de turnos",
  component: ActaTurnTimeline,
  parameters: {
    docs: {
      description: {
        component:
          "Cronología por turnos del acta en vivo: tarjetas por turno con chips de estado " +
          "(EN JUEGO / COMPLETADO / CERRADO), marcas de baja y — solo con `onSubmit` y en el " +
          "turno propio — la acción de tirada. Sin `onSubmit` queda en solo lectura.",
      },
    },
  },
};

export const SoloLectura = {
  name: "Solo lectura — partido finalizado",
  render: () => (
    <Timeline
      status="finished"
      half={2}
      turnNumber={5}
      activeSide="home"
      viewerSide="home"
    />
  ),
};

export const TurnoActivo = {
  name: "Turno activo del rival — acción de tirada disponible",
  render: () => (
    <Timeline
      status="live"
      half={2}
      turnNumber={3}
      activeSide="away"
      viewerSide="home"
      onSubmit={async () => undefined}
    />
  ),
};

export const Espectador = {
  name: "Espectador — sin acción de tirada",
  render: () => (
    <Timeline
      status="live"
      half={2}
      turnNumber={3}
      activeSide="away"
      viewerSide={null}
    />
  ),
};
