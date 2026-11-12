import { ActaDemoHarness, ActaFlow } from "./actaDemoHarness";
import { BASE, MIN, liveState } from "./actaFlow.fixtures";

/**
 * Visual twin of the V2 live-acta flow. This story MIRRORS the layout of
 * `MatchViewV2`'s `ActiveMatchBody` / `FinishedMatchBody` (artboard 08) —
 * when those change, keep this composition in sync. Components here are the
 * real ones, so design modifications show up instantly. Mock ES data; the
 * command pathway is a no-op (`onSubmit` never POSTs). The composition itself
 * lives in `actaDemoHarness.tsx` so the `/demo/partido` route renders the
 * same harness.
 */

export default {
  title: "Partido/New Styles/Flujo completo",
  component: ActaFlow,
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
  render: () => <ActaFlow state={liveState()} />,
};

export const EnVivoTurnoPropio = {
  name: "En vivo — turno propio (dock de captura)",
  render: () => (
    <ActaFlow
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
    <ActaFlow
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

/**
 * Demo (Fase 1 in Storybook, Fase 2 on /demo/partido): the flow driven by a
 * pure demo reducer (no network) over the REAL capture surfaces. The two rival
 * coach perspectives share one match state (manual switch + auto-follow);
 * scenario chips jump to key match states, the dock's guided modals record the
 * events, "Fin de turno" advances the turn, and "Restablecer" replays from the
 * kickoff (progress persists in localStorage).
 */
export const FlujoInteractivo = {
  name: "Flujo interactivo — demo (Fase 1)",
  render: () => <ActaDemoHarness label="Demo · Fase 1" />,
};
