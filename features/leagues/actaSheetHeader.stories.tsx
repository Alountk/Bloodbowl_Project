import { ActaSheetHeader, type ActaSheetHeaderProps } from "./actaSheetHeader";
import { awayTeam, homeTeam, league } from "./actaFlow.fixtures";

/**
 * Acta sheet header (MVA-1/MVA-2 + MVA-3 stepper half): league/round chrome,
 * top-bar score, per-side stat blocks and the 8-turn stepper. Mock ES data —
 * no network, no i18n provider. Data mirrors `actaFlow.fixtures.ts`.
 */

function Sheet(props: ActaSheetHeaderProps) {
  return (
    <div className="flex justify-center bg-background p-2">
      <div className="w-full max-w-2xl">
        <ActaSheetHeader {...props} />
      </div>
    </div>
  );
}

const teams = {
  home: {
    name: homeTeam.name,
    score: 2,
    rerolls: league.teamRerolls?.[homeTeam.id] ?? null,
    bribes: 1,
  },
  away: {
    name: awayTeam.name,
    score: 1,
    rerolls: league.teamRerolls?.[awayTeam.id] ?? null,
    bribes: 0,
  },
};

export default {
  title: "Partido/New Styles/Cabecera",
  component: ActaSheetHeader,
  parameters: {
    docs: {
      description: {
        component:
          "Cabecera del acta en vivo: liga/jornada, marcador superior, bloques de estadísticas " +
          "por equipo (recuperaciones, sobornos) y el stepper de 8 turnos por tiempo (MVA-3). " +
          "Los turnos con baja marcan el stepper; los estados nunca se inventan. Datos mock ES.",
      },
    },
  },
};

export const EnJuego = {
  name: "En juego — 2T turno 5, bajas marcadas",
  render: () => (
    <Sheet
      leagueName={league.name}
      round={3}
      status="live"
      half={2}
      turnNumber={5}
      home={teams.home}
      away={teams.away}
      weather="sun"
      casualtyTurns={[2, 4]}
    />
  ),
};

export const PrimerTiempo = {
  name: "Primer tiempo — 1T turno 8",
  render: () => (
    <Sheet
      leagueName={league.name}
      round={3}
      status="live"
      half={1}
      turnNumber={8}
      home={{ ...teams.home, score: 1 }}
      away={teams.away}
      weather={null}
      casualtyTurns={[3]}
    />
  ),
};

export const Finalizado = {
  name: "Finalizado — marcador final",
  render: () => (
    <Sheet
      leagueName={league.name}
      round={3}
      status="finished"
      half={2}
      turnNumber={8}
      home={teams.home}
      away={teams.away}
      weather="sun"
      casualtyTurns={[2, 4]}
    />
  ),
};
