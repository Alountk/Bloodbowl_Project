import { userEvent, within } from "storybook/test";
import { LiveActionDock } from "./liveActionDock";
import type { MatchPlayer } from "./api";

/**
 * Design-A contextual action dock (LM-46). A FIXED bottom bar offering only the
 * actions the viewer may legally record RIGHT NOW, per role:
 *  - ACTIVE coach: Dar el turno (rojo) · TD · Pase completo · Baja causada · Falta.
 *  - NON-active coach: solo Baja propia y Baja — ambos derribados.
 *  - Espectador / partido no live: nada (el dock no se renderiza).
 * Tocar una acción abre un modal centrado sobre el dock; Baja/Falta usan un
 * stepper guiado con el RollStepper 1D16 compartido y el comando se dispara solo
 * al completar la última selección. Los datos son mock ES.
 */

const human = (
  id: string,
  name: string,
  positionalKey: string,
  extras: Partial<MatchPlayer> = {},
): MatchPlayer => ({
  rosterPlayerId: id,
  name,
  positionalKey,
  pe: 0,
  skills: {},
  injuries: {},
  alive: true,
  missNextMatch: false,
  valueBonus: 0,
  ...extras,
});

const homeRoster: MatchPlayer[] = [
  human("h1", "Titus Roca", "blitzer"),
  human("h2", "Udo Mano de Piedra", "lineman"),
  human("h3", "Brunilda Veloz", "catcher"),
  human("h4", "Ferran el Mozo", "thrower", { journeyman: true }),
  human("h5", "Gerard Roldán", "blitzer"),
];

const opponentRoster: MatchPlayer[] = [
  human("o1", "Grishnak Mordaz", "blitzer"),
  human("o2", "Durburz Puño de Hierro", "big-un-blocker"),
  human("o3", "Morkok el Carnicero", "lineman"),
  human("o4", "Wurrzag Colmillo Negro", "thrower"),
];

function Dock({ viewerSide, activeSide }: { viewerSide: "home" | "away"; activeSide: "home" | "away" }) {
  return (
    <>
      {/* Fake page body so the fixed bar reads as an overlay, not a lone strip.
          Mirrors the app shell's main content width (full width + its padding)
          so the dock's alignment is judged against the real feed width. */}
      <div className="w-full px-4 pb-32 text-[13px] text-slate-500 sm:px-6">
        <p className="mb-3 rounded border border-[#e2e8f0] bg-white p-3 font-semibold text-[#12225a]">
          Cuerpo del partido (mock)
        </p>
        <div className="h-64 rounded border border-dashed border-[#cbd5e1] bg-white/60" />
      </div>
      <LiveActionDock
        viewerSide={viewerSide}
        activeSide={activeSide}
        status="live"
        roster={homeRoster}
        opponentRoster={opponentRoster}
        rosterRaceId="human"
        opponentRaceId="orc"
        onSubmit={async () => undefined}
      />
    </>
  );
}

const baseParams = {
  layout: "fullscreen" as const,
  docs: { source: { type: "code" as const } },
};

export default {
  title: "Live match/ActionDock (Diseño A)",
  component: LiveActionDock,
  parameters: {
    docs: {
      description: {
        component:
          "Dock contextual de acciones del partido en vivo. Barra fija inferior con las acciones " +
          "legales según el rol; el modal se centra sobre el dock. Espectador o partido no " +
          "live → no renderiza nada. Interactivo: abre las acciones y recorre el stepper guiado.",
      },
    },
  },
};

export const CoachActivo = {
  name: "Coach activo — dock cerrado",
  render: () => <Dock viewerSide="home" activeSide="home" />,
  parameters: { ...baseParams },
};

export const CoachActivoHojaTD = {
  name: "Coach activo — modal TD abierto",
  render: () => <Dock viewerSide="home" activeSide="home" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const td = await canvas.findByRole("button", { name: "Touchdown" });
    await userEvent.click(td);
  },
  parameters: {
    ...baseParams,
    docs: {
      description: {
        story: "TD es de dos toques: acción → jugador. Al abrir el modal se listan los dorsales propios elegibles.",
      },
    },
  },
};

export const CoachActivoFlujoBaja = {
  name: "Coach activo — Baja guiada (hasta la tirada)",
  render: () => <Dock viewerSide="home" activeSide="home" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Baja causada" }));
    // Causa → causante propio → víctima rival → stage de tirada 1D16.
    await userEvent.click(await canvas.findByRole("button", { name: "Bloqueo" }));
    const own = await canvas.findAllByTestId("dock-player-own");
    await userEvent.click(own[0]);
    const rival = await canvas.findAllByTestId("dock-player-rival");
    await userEvent.click(rival[0]);
    // Select a 13 → Permanente so the stepper waits for the 1D6 (stays open).
    await userEvent.click(await canvas.findByTestId("roll-option-13"));
  },
  parameters: {
    ...baseParams,
    docs: {
      description: {
        story: "Baja guiada recorrida hasta la tirada: el RollStepper 1D16 con bandas de color aparece en el modal.",
      },
    },
  },
};

export const CoachNoActivo = {
  name: "Coach no activo — dock cerrado",
  render: () => <Dock viewerSide="home" activeSide="away" />,
  parameters: {
    ...baseParams,
    docs: {
      description: {
        story: "Turno del rival: solo baja propia (Esquivando / El público) y baja — ambos derribados.",
      },
    },
  },
};

export const CoachNoActivoHojaBajaPropia = {
  name: "Coach no activo — modal Baja propia",
  render: () => <Dock viewerSide="home" activeSide="away" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    // Baja propia = flujo guiado: primero la propia víctima, luego la causa.
    await userEvent.click(await canvas.findByRole("button", { name: "Baja propia" }));
    const own = await canvas.findAllByTestId("dock-player-own");
    await userEvent.click(own[0]);
    // Dejamos el modal en el stage de causa (Esquivando — se cayó / El público).
    await canvas.findByTestId("dock-cause-pool");
  },
  parameters: {
    ...baseParams,
    docs: {
      description: {
        story: "Modal de 'Baja propia': causa autoinfligida primero (Esquivando — se cayó / El público).",
      },
    },
  },
};
