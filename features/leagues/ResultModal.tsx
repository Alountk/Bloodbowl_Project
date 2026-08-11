import { useMemo, useState } from "react";
import type { FixtureDraft, ResultPayload } from "./api";

/** A roster player reference (id + name) used to render per-player PE inputs. */
export interface RosterPlayerRef {
  id: string;
  name: string;
}

/** The numeric PE action credits collected for one player in the result form. */
export interface ResultPlayerDraft {
  tds: number;
  casualties: number;
  completions: number;
  interceptions: number;
  fouls: number;
  throwTeamMates: number;
  landedSafe: number;
}

/** A casualty victim targeted by this team (victim's team + roster player id). */
export interface ResultCasualtyDraft {
  team: "home" | "away";
  rosterPlayerId: string;
}

/** One team's in-progress result form state. */
export interface ResultTeamDraft {
  score: number;
  ballHeld: boolean;
  /** Per-player actions keyed by rosterPlayerId (every roster player present). */
  players: Record<string, ResultPlayerDraft>;
  /** Selected MJP nominations (≤ 6 unique roster player ids). */
  mvpNominations: string[];
  /** Casualty victims collected when any player on this team caused casualties. */
  casualties: ResultCasualtyDraft[];
}

const EMPTY_ACTIONS: ResultPlayerDraft = {
  tds: 0,
  casualties: 0,
  completions: 0,
  interceptions: 0,
  fouls: 0,
  throwTeamMates: 0,
  landedSafe: 0,
};

/**
 * Pure: assembles a `ResultPayload` from the form's per-team drafts. Guarantees
 * each roster player appears in the payload with their recorded actions, the MJP
 * nominations are deduplicated and capped at six, and the collected casualty
 * victims carry through unchanged. The server owns the actual dice rolls.
 */
export function buildResultPayload(
  home: ResultTeamDraft,
  away: ResultTeamDraft,
): ResultPayload {
  const toActions = (players: Record<string, ResultPlayerDraft>) =>
    Object.entries(players).map(([rosterPlayerId, a]) => ({
      rosterPlayerId,
      tds: a.tds,
      casualties: a.casualties,
      completions: a.completions,
      interceptions: a.interceptions,
      fouls: a.fouls,
      throwTeamMates: a.throwTeamMates,
      landedSafe: a.landedSafe,
    }));
  const nominations = (list: string[]) =>
    [...new Set(list.filter(Boolean))].slice(0, 6);

  return {
    home: {
      score: home.score,
      ballHeld: home.ballHeld,
      players: toActions(home.players),
      mvp: { nominations: nominations(home.mvpNominations) },
      casualties: home.casualties,
    },
    away: {
      score: away.score,
      ballHeld: away.ballHeld,
      players: toActions(away.players),
      mvp: { nominations: nominations(away.mvpNominations) },
      casualties: away.casualties,
    },
  };
}

/** Sums a team's per-player TDs for the ΣTD == score guard. */
export function sumDraftedTds(players: Record<string, ResultPlayerDraft>): number {
  return Object.values(players).reduce((total, a) => total + a.tds, 0);
}

export interface ResultModalProps {
  open: boolean;
  fixture: FixtureDraft;
  /** Maps member team id → team display name. */
  teamNameById: Map<string, string>;
  /** Roster players (id + name) of the home and away fixture teams. */
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
  /** "load" (captain/admin on a scheduled fixture) or "correct" (admin on a played result). */
  mode: "load" | "correct";
  /** Fires with the assembled payload to POST (load) or PUT (correct). */
  onSubmit: (payload: ResultPayload) => void;
  onClose: () => void;
}

/**
 * ResultModal — Spanish league-section copy. Lets a fixture captain or the
 * league admin load a result on a scheduled (not-yet-played) fixture, and lets
 * the admin correct a played result (PUT, admin-only). Collects home/away
 * scores, per-player PE actions (including TTM/lanzar+aterrizar), casualty
 * victims when a player caused them (resolves the S2 casualty-count vs
 * victim-list consistency warning), and six MJP nominations numbered 1–6 per
 * team. The server owns the 1D6 MJP roll and the per-victim 1D16 injury roll.
 */
export function ResultModal({
  open,
  fixture,
  teamNameById,
  homeRoster,
  awayRoster,
  mode,
  onSubmit,
  onClose,
}: ResultModalProps) {
  const [home, setHome] = useState<ResultTeamDraft>(() =>
    emptyTeamDraft(),
  );
  const [away, setAway] = useState<ResultTeamDraft>(() =>
    emptyTeamDraft(),
  );
  const [error, setError] = useState<string | null>(null);

  const homeName = teamNameById.get(fixture.homeTeamId) ?? "Local";
  const awayName = teamNameById.get(fixture.awayTeamId) ?? "Visitante";
  const title = mode === "correct" ? "Corregir resultado" : "Cargar resultado";
  const confirmLabel = mode === "correct" ? "Corregir resultado" : "Guardar resultado";

  const homeRostersByTeam = useMemo(
    () => ({ home: homeRoster, away: awayRoster }),
    [homeRoster, awayRoster],
  );

  if (!open) return null;

  const submit = () => {
    const tdsHome = sumDraftedTds(home.players);
    const tdsAway = sumDraftedTds(away.players);
    if (tdsHome !== home.score || tdsAway !== away.score) {
      setError("La suma de anotaciones de cada equipo debe coincidir con su marcador final.");
      return;
    }
    setError(null);
    onSubmit(buildResultPayload(home, away));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[#e2e8f0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between bg-[#12225a] px-4 py-3 text-white">
          <h3 className="text-sm font-bold">
            {title} · {homeName} vs {awayName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <div className="space-y-4 px-4 py-3">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <TeamResultSection
            name={homeName}
            roster={homeRoster}
            draft={home}
            setDraft={setHome}
            victimSourceRosters={homeRostersByTeam}
          />
          <TeamResultSection
            name={awayName}
            roster={awayRoster}
            draft={away}
            setDraft={setAway}
            victimSourceRosters={homeRostersByTeam}
          />

          <div className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function emptyTeamDraft(): ResultTeamDraft {
    return {
      score: 0,
      ballHeld: true,
      players: {},
      mvpNominations: [],
      casualties: [],
    };
  }
}

function TeamResultSection({
  name,
  roster,
  draft,
  setDraft,
  victimSourceRosters,
}: {
  name: string;
  roster: RosterPlayerRef[];
  draft: ResultTeamDraft;
  setDraft: React.Dispatch<React.SetStateAction<ResultTeamDraft>>;
  victimSourceRosters: { home: RosterPlayerRef[]; away: RosterPlayerRef[] };
}) {
  // Ensure every roster player has an initialized action row.
  const players = { ...draft.players };
  for (const player of roster) {
    if (!players[player.id]) players[player.id] = { ...EMPTY_ACTIONS };
  }

  const setPlayer = (playerId: string, patch: Partial<ResultPlayerDraft>) => {
    const next = { ...draft.players, [playerId]: { ...(players[playerId] ?? EMPTY_ACTIONS), ...patch } };
    setDraft({ ...draft, players: next });
  };

  const totalCasualties = Object.values(players).reduce(
    (sum, a) => sum + a.casualties,
    0,
  );
  const victimSlots = Array.from({ length: totalCasualties }, (_, i) => i);

  const setVictim = (index: number, value: string) => {
    const next = [...draft.casualties];
    if (!value) {
      next[index] = { team: "home", rosterPlayerId: "" };
    } else {
      const [team, rosterPlayerId] = value.split(":") as ["home" | "away", string];
      next[index] = { team, rosterPlayerId };
    }
    setDraft({ ...draft, casualties: next });
  };

  const setMvp = (index: number, playerId: string) => {
    const next = [...draft.mvpNominations];
    next[index] = playerId;
    setDraft({ ...draft, mvpNominations: next });
  };

  return (
    <section aria-label={`Resultado ${name}`} className="border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] pb-2">
        <h4 className="text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h4>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600">
            Goles {name}
            <input
              type="number"
              min={0}
              value={draft.score}
              onChange={(e) => setDraft({ ...draft, score: Number(e.target.value) || 0 })}
              aria-label={`Goles ${name}`}
              className="ml-2 w-16 rounded-sm border border-slate-300 px-2 py-1 text-sm text-slate-800"
            />
          </label>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={draft.ballHeld}
              onChange={(e) => setDraft({ ...draft, ballHeld: e.target.checked })}
            />
            Mantuvo el balón
          </label>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {roster.map((player) => (
          <PlayerActionsRow
            key={player.id}
            player={player}
            actions={players[player.id] ?? EMPTY_ACTIONS}
            onActions={(patch) => setPlayer(player.id, patch)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <label key={i} className="text-xs font-medium text-slate-600">
            MVP {i + 1} {name}
            <select
              value={draft.mvpNominations[i] ?? ""}
              onChange={(e) => setMvp(i, e.target.value)}
              aria-label={`MVP ${i + 1} ${name}`}
              className="ml-1 rounded-sm border border-slate-300 px-1.5 py-1 text-sm text-slate-800"
            >
              <option value="">—</option>
              {roster.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="w-full text-[11px] text-slate-500">
          Mejor jugador: el servidor lanza 1D6 entre las 6 nominaciones.
        </p>
      </div>

      {totalCasualties > 0 ? (
        <div className="mt-3 border-t border-[#e2e8f0] pt-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Víctimas</p>
          {victimSlots.map((i) => (
            <label key={i} className="mt-1 block text-xs font-medium text-slate-600">
              Víctima {i + 1}
              <select
                value={
                  draft.casualties[i]
                    ? `${draft.casualties[i].team}:${draft.casualties[i].rosterPlayerId}`
                    : ""
                }
                onChange={(e) => setVictim(i, e.target.value)}
                aria-label={`Víctima ${i + 1}`}
                className="ml-2 rounded-sm border border-slate-300 px-1.5 py-1 text-sm text-slate-800"
              >
                <option value="">—</option>
                {(Object.keys(victimSourceRosters) as ("home" | "away")[]).map((team) =>
                  victimSourceRosters[team].map((p) => (
                    <option key={`${team}:${p.id}`} value={`${team}:${p.id}`}>
                      {p.name} ({team === "home" ? "local" : "visitante"})
                    </option>
                  )),
                )}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** One roster player's numeric PE action inputs. */
function PlayerActionsRow({
  player,
  actions,
  onActions,
}: {
  player: RosterPlayerRef;
  actions: ResultPlayerDraft;
  onActions: (patch: Partial<ResultPlayerDraft>) => void;
}) {
  const fields: Array<[keyof ResultPlayerDraft, string]> = [
    ["tds", "Anotaciones"],
    ["casualties", "Bajas causadas"],
    ["completions", "Pases completos"],
    ["interceptions", "Intercepciones"],
    ["fouls", "Faltas"],
    ["throwTeamMates", "Lanzar compañero"],
    ["landedSafe", "Aterrizar sano"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
      <span className="w-32 font-semibold text-[#12225a]">{player.name}</span>
      {fields.map(([key, label]) => (
        <label key={key} className="flex items-center gap-1 text-slate-500">
          {label}
          <input
            type="number"
            min={0}
            value={actions[key]}
            onChange={(e) => onActions({ [key]: Number(e.target.value) || 0 })}
            aria-label={`${label} ${player.name}`}
            className="w-12 rounded-sm border border-slate-300 px-1.5 py-0.5 text-sm text-slate-800"
          />
        </label>
      ))}
    </div>
  );
}
