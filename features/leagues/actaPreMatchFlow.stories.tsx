import {
  ActaPreMatchFlow,
  type ActaPreMatchSnapshot,
} from "./actaPreMatchFlow";
import { awayTeam, homeTeam } from "./actaFlow.fixtures";

/**
 * Fase 1 · Pre-partido (S5 + S2c): the rulebook pre-match capture step panel —
 * Hinchas (1D3 + dedicated fans), Clima (1D6 per coach → 2D6 table), Incentivos
 * (selected by the coaches) and Equipo Pateador (opposed 1D6) + the league-only
 * substitutes note. The capture is scoped PER SIDE (`viewerSide`) and the
 * «Lo que ha sucedido» report informs every confirmed fact. Mock ES data — no
 * network, no i18n provider.
 */

const empty: ActaPreMatchSnapshot = {
  fans: { home: null, away: null },
  weather: null,
  weatherDice: { home: null, away: null },
  inducements: { home: [], away: [] },
  inducementsDone: { home: false, away: false },
  kickDice: { home: null, away: null },
  kicking: null,
};

const complete: ActaPreMatchSnapshot = {
  fans: {
    home: { base: 4, dice: 3, total: 7 },
    away: { base: 3, dice: 2, total: 5 },
  },
  weather: { roll: 7, value: "perfect" },
  weatherDice: { home: 3, away: 4 },
  inducements: {
    home: [{ id: "bribes", count: 1 }],
    away: [{ id: "weather-mage", count: 1 }],
  },
  inducementsDone: { home: true, away: true },
  kickDice: { home: 5, away: 3 },
  kicking: "away",
};

function Flow({ done }: { done?: boolean }) {
  return (
    <div className="flex justify-center bg-background p-2">
      <div className="w-full max-w-2xl">
        <ActaPreMatchFlow
          homeName={homeTeam.name}
          awayName={awayTeam.name}
          homeBase={4}
          awayBase={3}
          viewerSide="home"
          snapshot={done ? complete : empty}
          onCommit={() => undefined}
        />
      </div>
    </div>
  );
}

export default {
  title: "Partido/New Styles/Fase 1 pre-partido",
  component: ActaPreMatchFlow,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    docs: {
      description: {
        component:
          "Fase 1 · Pre-partido (S5): la secuencia reglamentaria capturada en el acta — " +
          "Hinchas (1D3 + aficionados dedicados), Clima (2D6), Incentivos (seleccionados por " +
          "los entrenadores) y Equipo Pateador (1D6 enfrentado) + nota de sustitutos. Cada " +
          "tirada es manual por defecto con opción Auto. Datos mock ES.",
      },
    },
  },
};

export const Vacio = {
  name: "Vacío",
  render: () => <Flow />,
};

export const Completado = {
  name: "Completado",
  render: () => <Flow done />,
};
