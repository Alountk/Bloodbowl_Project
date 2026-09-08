import type { ReactNode } from "react";
import { MatchCard } from "@/features/leagues/MatchCard";
import type { FixtureDraft, LeagueMemberTeam } from "@/features/leagues/api";
import { StandingsTable } from "@/features/leagues/StandingsTable";

/**
 * Direction previews (Sección 1) — NOT production. Static Storybook mockups that
 * re-skin the REAL components (MatchCard / StandingsTable) by overriding the
 * CSS custom properties every `@theme` token compiles to (`var(--color-navy)`,
 * etc.). Because the components already consume tokens, remapping the vars in a
 * scoped container re-skins them without touching source. Each direction is
 * shown at three breakpoints (360 / 768 / 1200) so the mobile→desktop story is
 * visible side-by-side.
 *
 * Semantics that MUST NOT change meaning across directions: home vs away,
 * severity ramp (5 bands), ok/review (green/red). The previews keep those
 * intact and only remap brand/surface tokens.
 */

// ---------------------------------------------------------------------------
// Shared mocks (mirror MatchCard.stories.tsx / StandingsTable.stories.tsx)
// ---------------------------------------------------------------------------

const teamNameById = new Map([
  ["th", "Águilas de Khemri"],
  ["ta", "Colmillos del Caos"],
]);
const raceNameById = new Map([
  ["th", "Reyes funerarios"],
  ["ta", "Orcos"],
]);

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "th",
    awayTeamId: "ta",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    status: "pending",
    homeOwner: { id: "u1", name: "Susana" },
    awayOwner: { id: "u2", name: "Iván" },
    proposals: [],
    ...overrides,
  };
}

const TEAMS: LeagueMemberTeam[] = [
  { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", userId: "u1", roster: [], coaching: null },
  { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l1", userId: "u2", roster: [], coaching: null },
  { id: "t3", name: "Zombies", raceId: "necromantic", leagueId: "l1", userId: "u3", roster: [], coaching: null },
];

const playedFixtures: FixtureDraft[] = [
  fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1", status: "played" }),
  fixture({ id: "f2", homeTeamId: "t3", awayTeamId: "t1", homeScore: 1, awayScore: 1, winnerId: null, status: "played" }),
  fixture({ id: "f3", homeTeamId: "t2", awayTeamId: "t3", homeScore: 0, awayScore: 3, winnerId: "t3", status: "played" }),
];

const noop = () => undefined;

function Card({ f, admin = false }: { f: FixtureDraft; admin?: boolean }) {
  return (
    <MatchCard
      fixture={f}
      teamNameById={teamNameById}
      raceNameById={raceNameById}
      currentUserId="u3"
      isLeagueOwner={admin}
      onNegotiate={noop}
      onForfeit={noop}
      onLoadResult={noop}
      onCorrectResult={noop}
    />
  );
}

// ---------------------------------------------------------------------------
// Direction token overrides (scoped CSS vars)
// ---------------------------------------------------------------------------

/**
 * Dirección base — "Tablón americano" (implementada). La paleta rulebook-light
 * se mantiene (navy/red semánticos) y solo se añade el acento end-zone #e86a17
 * para scores/jornadas. Este preview monta el tema base tal cual está en
 * app/globals.css (sin override de marca).
 */
const DIRECTION_1: React.CSSProperties = {} as React.CSSProperties;

/** Dirección opcional — "Reglamento vintage" ([data-theme="vintage"]). Las
 * mismas vars que app/globals.css define para el modo vintage a posteriori. */
const DIRECTION_3: React.CSSProperties = {
  "--color-navy": "#1d2a4d",
  "--color-navy-hover": "#2a3a63",
  "--color-navy-tint": "#3a4c78",
  "--color-navy-grad": "#475998",
  "--color-red": "#b3282d",
  "--color-red-hover": "#8f2024",
  "--color-red-tint": "#7d2a2e",
  "--color-background": "#f6f1e6",
  "--color-panel": "#fdfaf2",
  "--color-ink": "#2b2618",
  "--color-slate": "#6b6254",
  "--color-slate-strong": "#4a443a",
  "--color-border": "#ddd3bf",
  "--color-border-subtle": "#c9bda6",
  "--color-fill-hover": "#efe8d8",
} as React.CSSProperties;

// ---------------------------------------------------------------------------
// Layout scaffold
// ---------------------------------------------------------------------------

const BREAKPOINTS = [
  { label: "Móvil · 360px", width: 360 },
  { label: "Tablet · 768px", width: 768 },
  { label: "Desktop · 1200px", width: 1200 },
] as const;

function Viewport({
  width,
  label,
  children,
}: {
  width: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] font-bold tracking-wide text-[#64748b]">{label}</span>
      <div
        className="shrink-0 overflow-hidden rounded border border-[#cbd5e1] shadow-sm"
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}

/** A jornada-ish preview: a standings table + two match cards, at one width. */
function Scene({ vars, note }: { vars: React.CSSProperties; note: string }) {
  return (
    <div style={{ ...vars }} className="bg-[var(--color-background)] p-3 text-[var(--color-ink)]">
      <div className="flex flex-col gap-3">
        <StandingsTable teams={TEAMS} fixtures={playedFixtures} championTeamId="t3" />
        <Card f={fixture()} />
        <Card
          f={fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 })}
        />
        <p className="border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-slate)]">
          {note}
        </p>
      </div>
    </div>
  );
}

function Direction({ vars, title, note }: { vars: React.CSSProperties; title: string; note: string }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-[#0f172a]">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">
        {BREAKPOINTS.map((bp) => (
          <Viewport key={bp.label} width={bp.width} label={bp.label}>
            <Scene vars={vars} note={note} />
          </Viewport>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default {
  title: "Rulebook Light/Direcciones (preview)",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Previsualización del tema base 'Tablón americano' (implementado) y el modo " +
          "opcional 'Reglamento vintage' ([data-theme=\"vintage\"], a posteriori). " +
          "Monta los componentes reales (MatchCard, StandingsTable) a 360 / 768 / 1200px.",
      },
    },
  },
};

export const BaseTablónAmericano = {
  name: "Base · Tablón americano",
  render: () => (
    <Direction
      title="Base — Tablón americano (navy/rojo + acento end-zone #e86a17 en scores)"
      vars={DIRECTION_1}
      note="Tema por defecto: paleta rulebook-light intacta, tipo display Anton en scores/jornadas, naranja end-zone solo en el marcador."
    />
  ),
};

export const VintageOpcional = {
  name: "Opcional · Reglamento vintage",
  render: () => (
    <Direction
      title='Opcional — Reglamento vintage ([data-theme="vintage"])'
      vars={DIRECTION_3}
      note="Las mismas vars de app/globals.css para el modo vintage. Implementación del selector a posteriori."
    />
  ),
};

export const ComparativaLadoALado = {
  name: "Comparativa lado a lado (desktop)",
  render: () => (
    <div className="grid grid-cols-1 gap-6 p-4 xl:grid-cols-2">
      {([
        ["Base · Tablón americano", DIRECTION_1],
        ["Opcional · Reglamento vintage", DIRECTION_3],
      ] as const).map(([title, vars]) => (
        <div key={title} className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-[#0f172a]">{title}</span>
          <Scene vars={vars} note="" />
        </div>
      ))}
    </div>
  ),
};
