import {
  ActaPreMatchFlow,
  type ActaPreMatchSnapshot,
} from "./actaPreMatchFlow";
import { awayTeam, homeTeam } from "./actaFlow.fixtures";

/**
 * Fase 1 · Pre-partido (S5): the rulebook pre-match capture step panel —
 * Hinchas (1D3 + dedicated fans), Clima (2D6 table), Incentivos (selected by
 * the coaches) and Equipo Pateador (opposed 1D6) + the league-only
 * substitutes note. Mock ES data — no network, no i18n provider.
 */

const empty: ActaPreMatchSnapshot = {
  fans: null,
  weather: null,
  inducements: { home: [], away: [] },
  inducementsDone: false,
  kicking: null,
};

const complete: ActaPreMatchSnapshot = {
  fans: {
    home: { base: 4, dice: 2, total: 6 },
    away: { base: 3, dice: 1, total: 4 },
  },
  weather: { roll: 7, value: "perfect" },
  inducements: {
    home: [{ id: "bribes", count: 1 }],
    away: [{ id: "weather-mage", count: 1 }],
  },
  inducementsDone: true,
  kicking: "home",
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

export const Vacio = () => <Flow />;

export const Completado = () => <Flow done />;
