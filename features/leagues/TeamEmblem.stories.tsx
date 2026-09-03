import { TeamEmblem } from "./TeamEmblem";

/**
 * Deterministic team-emblem placeholder (teams have no emblem field yet).
 * A navy/red-tinted circle derived from the team id with the team's INITIAL
 * inside — or, in the match header (MVT-8), the derived ACRONYM (particles like
 * "de/del/la" skipped, up to 3 significant tokens). Rulebook-light: tones are
 * navy/red tints only.
 */

const SIZE_ROW = [
  { size: "xs", label: "xs · 34px (header)" },
  { size: "sm", label: "sm · 32px" },
  { size: "md", label: "md · 40px (default)" },
  { size: "lg", label: "lg · 64px" },
  { size: "xl", label: "xl · 54px" },
] as const;

function Swatch({ teamId, name, acronym = false }: { teamId: string; name: string; acronym?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-[#e2e8f0] bg-white p-3">
      <div className="flex flex-wrap items-end justify-center gap-3">
        {SIZE_ROW.map((s) => (
          <TeamEmblem key={s.size} teamId={teamId} name={name} size={s.size} acronym={acronym} />
        ))}
      </div>
      <p className="text-xs font-semibold text-[#0f172a]">{name}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
        {acronym ? "acrónimo" : "inicial"} · id “{teamId}”
      </p>
    </div>
  );
}

export default {
  title: "Identity/TeamEmblem",
  component: TeamEmblem,
  parameters: {
    docs: {
      description: {
        component:
          "Placeholder determinista del emblema de equipo: círculo con tinte marino/rojo derivado " +
          "del id (estable entre renders) y la inicial — o el acrónimo en el header del partido.",
      },
    },
  },
};

export const InicialVsAcronimo = {
  name: "Inicial vs acrónimo",
  render: () => (
    <div className="grid max-w-4xl grid-cols-1 gap-3 p-3 sm:grid-cols-2">
      <Swatch teamId="team-aguilas" name="Águilas de Khemri" />
      <Swatch teamId="team-aguilas" name="Águilas de Khemri" acronym />
      <Swatch teamId="team-kdo" name="Khemri Death Orcs" />
      <Swatch teamId="team-kdo" name="Khemri Death Orcs" acronym />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "“Águilas de Khemri” → inicial A / acrónimo AK (la partícula “de” se omite). " +
          "“Khemri Death Orcs” → inicial K / acrónimo KDO.",
      },
    },
  },
};

export const TonosDeterministas = {
  name: "Tonos por id (deterministas)",
  render: () => (
    <div className="flex max-w-4xl flex-wrap items-center gap-3 p-3">
      {["team-a", "team-b", "team-c", "team-d", "team-e", "team-f", "team-g", "team-h"].map((id) => (
        <TeamEmblem key={id} teamId={id} name={`Club ${id}`} />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "El tinte marino/rojo sale de un hash estable del id: el mismo equipo siempre luce igual.",
      },
    },
  },
};

export const Fallbacks = {
  name: "Casos límite",
  render: () => (
    <div className="flex max-w-4xl flex-wrap items-center gap-3 p-3">
      <TeamEmblem teamId="t-short" name="Orcos" />
      <TeamEmblem teamId="t-short" name="Orcos" acronym />
      <TeamEmblem teamId="t-particle" name="Los Ángeles del Sur" acronym />
      <TeamEmblem teamId="t-empty" name="" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Token único, nombres con solo partículas (→ “?”) y nombre vacío (→ “?”).",
      },
    },
  },
};
