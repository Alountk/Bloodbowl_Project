import {
  ActaPreMatchWizard,
  type ActaPreMatchSnapshot,
} from "./actaPreMatchWizard";
import { PRE_MATCH_FINANCE, awayTeam, homeTeam } from "./actaFlow.fixtures";

/**
 * S6 · Modal wizard «Antes del partido» (design «Opción 5 · Editorial
 * Minimalista»): ONE step at a time, the dice button records the roll
 * directly (the Manual/Auto toggle is gone — the manual field is the quiet
 * physical-die override), and the last step closes the modal so everything
 * derives into the acta. Capture is scoped PER SIDE (S2c). Mock ES data —
 * no network, no i18n provider.
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

const inProgress: ActaPreMatchSnapshot = {
  fans: {
    home: { base: 4, dice: 3, total: 7 },
    away: { base: 3, dice: 2, total: 5 },
  },
  weather: null,
  weatherDice: { home: 4, away: 3 },
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
  weatherDice: { home: 4, away: 3 },
  inducements: {
    home: [{ id: "bribes", count: 1 }],
    away: [{ id: "bloodweiser-kegs", count: 2 }],
  },
  inducementsDone: { home: true, away: true },
  kickDice: { home: 5, away: 3 },
  kicking: "away",
};

const baseArgs = {
  homeName: homeTeam.name,
  awayName: awayTeam.name,
  homeBase: 4,
  awayBase: 3,
  viewerSide: "home" as const,
  finance: PRE_MATCH_FINANCE,
  onCommit: () => undefined,
  onDismiss: () => undefined,
  onFinish: () => undefined,
};

export default {
  title: "Partido/New Styles/Antes del partido · Wizard",
  component: ActaPreMatchWizard,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    docs: {
      description: {
        component:
          "Modal wizard «Antes del partido» (S6 · Opción 5 Editorial Minimalista): " +
          "secuencia por pasos (nunca apilados), el botón de dado registra la tirada " +
          "automática directamente (sin toggle Manual/Auto), el campo manual queda como " +
          "override discreto del dado físico, y al finalizar el último paso el modal se " +
          "cierra y todo deriva al acta. Captura por lado (S2c). Datos mock ES.",
      },
    },
  },
};

export const Vacio = {
  args: { ...baseArgs, open: true, snapshot: empty },
};

export const Clima = {
  args: { ...baseArgs, open: true, snapshot: inProgress },
};

export const Completado = {
  args: { ...baseArgs, open: true, snapshot: complete },
};

export const Cerrado = {
  args: { ...baseArgs, open: false, snapshot: empty },
};
