import { HeaderEmblem } from "./headerEmblem";
import { TeamEmblem } from "./TeamEmblem";

/**
 * MVT-8/MVT-9 match-header emblem host: a keyboard-reachable `role="img"` with
 * the header acronym glyph (TeamEmblem xs) inside. The full team name never
 * renders as text in the header — it lives in aria-label + a desktop-only
 * (pointer:fine + hover/focus) CSS tooltip that flips per side: home anchors
 * left, away anchors right so edge columns never overflow.
 */

export default {
  title: "Identity/HeaderEmblem",
  component: HeaderEmblem,
  parameters: {
    docs: {
      description: {
        component:
          "Emblema del header del partido (Concepto B turn-first): glifo-acrónimo + tooltip del " +
          "nombre completo al hover/foco en desktop. El tooltip nunca entra en el árbol a11y.",
      },
    },
  },
};

/** A mock RulebookHeader navy strip, so tooltips and side anchors read in context. */
function HeaderStrip({ homeName, awayName }: { homeName: string; awayName: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[#12225a] px-4 pb-4 pt-10 text-white">
      <HeaderEmblem teamId="team-home" name={homeName} side="home" />
      <div className="text-center">
        <p className="text-xl font-black">1 - 1</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#ffd9e0]">
          Turno {awayName} · T5
        </p>
      </div>
      <HeaderEmblem teamId="team-away" name={awayName} side="away" />
    </div>
  );
}

export const ColumnaLocalYVisitante = {
  name: "Local (izq.) y visitante (der.)",
  render: () => (
    <div className="max-w-md p-3">
      <HeaderStrip homeName="Águilas de Khemri" awayName="Khemri Death Orcs" />
      <p className="mt-4 max-w-md text-xs leading-relaxed text-[#64748b]">
        Pasa el cursor (o enfoca con Tab) sobre cada emblema: el tooltip muestra el nombre
        completo. El local ancla el tooltip a la izquierda; el visitante a la derecha.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Header mock (no es la página MatchView): acrónimo AK / KDO con tooltip por columna.",
      },
    },
  },
};

export const SoloGlifos = {
  name: "Glifo (TeamEmblem xs acrónimo)",
  render: () => (
    <div className="flex flex-wrap items-end gap-3 p-3">
      {(
        [
          ["Águilas de Khemri", "AK"],
          ["Khemri Death Orcs", "KDO"],
          ["Los Hurones", "H"],
          ["Club Deportivo Norte", "CDN"],
        ] as const
      ).map(([name, glyph]) => (
        <div key={name} className="flex flex-col items-center gap-2 rounded border border-[#e2e8f0] bg-white p-3">
          <TeamEmblem teamId={`glyph-${name}`} name={name} acronym size="xs" />
          <p className="text-[10px] font-bold text-[#0f172a]">
            {name} → {glyph}
          </p>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "La regla de acrónimo (MVT-8/D1) sobre nombres largos: partículas omitidas, hasta 3 tokens.",
      },
    },
  },
};
