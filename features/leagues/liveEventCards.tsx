import { getRaceById } from "@/features/teams/data/races";
import { deriveMinute, playerRef, turnTag, derivePartialScore } from "@/lib/liveFeed";
import {
  CAUSE_LABELS,
  EVENT_GLYPH,
  KICKOFF_OUTCOME_LABELS,
  formatTreasury,
  liveEventLabel,
  eventSpp,
  casualtyIcon,
  bandSubLabel,
} from "./liveEventLabels";
import { Icon, type IconName } from "./icons";
import type { LiveMatchView, MatchTeamDetail } from "./api";

/**
 * The Design-A per-event kind surface that renders as a TEAM card at 68% width
 * (MVT-1): a wide-event usually names a player on one side, so the card sits on
 * that team's side with a navy (home) / red (away) internal gradient. The
 * kickoff `expensive_mistake` is a team card too (MVT-6/LM-24, no turn tag /
 * minute per the preview's team-assigned kickoff row), and `turnStart` is a
 * team card for the side whose turn starts (RAU-36/37). Every other display
 * kind (start/endHalf/endMatch/fan_factor) is a GENERIC event at 100%. The
 * `turn` ("Fin de turno") kind is NOT in the set — it is skipped outright in
 * the render map so the feed never surfaces it (RAU-36/37).
 */
const TEAM_EVENT_KINDS = new Set(["td", "completion", "casualty", "foul", "mvp", "expensive_mistake", "turnStart"]);

/** A roster player lookup for a side: id → { name, dorsal, positionalKey }. */
type RosterLookup = { name: string; dorsal: number; positionalKey: string } | undefined;

/** The served players array of a match side, mapped via playerRef (D21). */
function sideLookup(team: MatchTeamDetail): Map<string, number> {
  return playerRef(team.players);
}

function findPlayer(team: MatchTeamDetail, rosterPlayerId: string, ref: Map<string, number>): RosterLookup {
  const p = team.players.find((pl) => pl.rosterPlayerId === rosterPlayerId);
  if (!p) return undefined;
  const dorsal = ref.get(p.rosterPlayerId);
  if (dorsal == null) return undefined;
  return { name: p.name, dorsal, positionalKey: p.positionalKey };
}

/** The positional display name for a player line ("blitzer" → "Blitzer"). */
function positionName(team: MatchTeamDetail, positionalKey: string): string {
  const race = getRaceById(team.raceId);
  return race?.positionals.find((pos) => pos.key === positionalKey)?.name ?? positionalKey;
}

/**
 * MVT-5 foul victim: resolved from the payload's `victimRosterId` against the
 * OPPOSITE roster (LM-12 invariant: the victim of a foul is an opponent).
 * Absent/unresolvable → null (no victim line, legacy fallback).
 */
function foulVictim(
  payload: Record<string, unknown>,
  oppositeTeam: MatchTeamDetail,
  oppositeRef: Map<string, number>,
): { name: string; dorsal: number } | null {
  const victimId = payload.victimRosterId;
  if (typeof victimId !== "string") return null;
  const v = findPlayer(oppositeTeam, victimId, oppositeRef);
  return v ? { name: v.name, dorsal: v.dorsal } : null;
}

/**
 * MVT-5 casualty cause+causer parts: the causer, when resolved, reads
 * "por {name} (#{dorsal}) · {cause}" (name in `<b>` at the render site); a
 * `crowd` casualty with no causer reads "El público"; a `dodge` (or any
 * causer-less casualty) shows the bare cause label. An unknown cause passes
 * through unchanged (MVT-5, never throws).
 */
function casualtyCauseParts(
  payload: Record<string, unknown>,
  oppositeTeam: MatchTeamDetail,
  oppositeRef: Map<string, number>,
): { causer: { name: string; dorsal: number } | null; cause: string } {
  const cause = typeof payload.cause === "string" ? payload.cause : "";
  // Crowd/self-inflicted omit the causer by server invariant (LM-12) — the
  // cause label already IS the whole line ("El público" / "Esquivando — se cayó").
  if (cause === "crowd" || cause === "dodge") {
    return { causer: null, cause: CAUSE_LABELS[cause] ?? cause };
  }
  const causerId = payload.causerRosterId;
  if (typeof causerId === "string") {
    const c = findPlayer(oppositeTeam, causerId, oppositeRef);
    const label = CAUSE_LABELS[cause] ?? cause;
    if (c) return { causer: { name: c.name, dorsal: c.dorsal }, cause: label };
    // Causer present but unresolvable → fall back to the bare cause (never throw).
    return { causer: null, cause: label };
  }
  return { causer: null, cause: CAUSE_LABELS[cause] ?? cause };
}

/**
 * The es-ES treasury before → after line for an `expensive_mistake` card
 * (LM-24), e.g. "234.000 → 214.000 M.O.". Returns null when either field is
 * missing/non-numeric so the caller renders the label WITHOUT the line and
 * never throws (LM-24 fallback).
 */
function treasuryLine(payload: Record<string, unknown>): string | null {
  const before = payload.treasuryBefore;
  const after = payload.treasuryAfter;
  if (typeof before !== "number" || typeof after !== "number") return null;
  // es-ES dot-thousands BEFORE (no suffix) → formatTreasury AFTER (carries the
  // single trailing " M.O."), per LM-24 "234.000 → 214.000 M.O.".
  const beforeText = new Intl.NumberFormat("es-ES").format(before);
  return `${beforeText} → ${formatTreasury(after)}`;
}

/** The outcome display label for an `expensive_mistake` card (LM-24). */
function outcomeLabel(payload: Record<string, unknown>): string | null {
  const outcome = payload.outcome;
  if (typeof outcome !== "string") return null;
  return KICKOFF_OUTCOME_LABELS[outcome] ?? outcome;
}

/**
 * The compact per-team fan-factor copy for the centered `fan_factor` row
 * (LM-24, kept verbatim): `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`.
 * A missing/malformed per-team object falls back to a bare `Local: ? ·
 * Visitante: ?` marker so the row always renders and never throws.
 */
function fanTotalsLine(payload: Record<string, unknown>): string {
  const fmt = (side: unknown): string => {
    if (typeof side !== "object" || side === null) return "?";
    const o = side as Record<string, unknown>;
    const base = o.base;
    const roll = o.dice;
    const total = o.total;
    const b = typeof base === "number" ? String(base) : "?";
    const d = typeof roll === "number" ? String(roll) : "?";
    const t = typeof total === "number" ? String(total) : "?";
    return `👥${b} + 🎲${d} = ${t}`;
  };
  return `Local: ${fmt(payload.home)} · Visitante: ${fmt(payload.away)}`;
}

/** The kickoff wall-clock sub-line for the `start` row ("HH:MM", v7). */
function kickoffTime(startedAt: number): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The Tourplay chronology as a card grid (v7): a gray box (`#eef1f6`) with a
 * full 1px border, `12px 14px` inner padding and 2px gaps. Team events sit at
 * 68% with the side gradient and grid-template-areas (turn tag top on the
 * team's side, minute bottom on the opposite side); generic events span 100%
 * left-aligned with the icon left + expanded content + a right side. `live-event-row`
 * is preserved on each card `li` (spec continuity).
 */
export function LiveEventCards({
  events,
  startedAt,
  homeTeam,
  awayTeam,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  if (events.length === 0) return null;
  // D21 dorsal maps + per-TD partial scores (D5), formed from the SAME events
  // array the feed renders — a reload reproduces both.
  const homeRef = sideLookup(homeTeam);
  const awayRef = sideLookup(awayTeam);
  const partialScores = derivePartialScore(events);

  // Mockup chronology (Design A): NEWEST FIRST.
  const ordered = [...events].sort((a, b) => b.seq - a.seq);

  return (
    <ol
      aria-label="Cronología del partido"
      className="flex flex-col gap-[2px] border border-[#e2e8f0] bg-[#eef1f6] px-[14px] py-[12px]"
    >
      {ordered.map((event) => {
        // RAU-36/37: the generic "Fin de turno" row is noise — the turn change
        // is conveyed ONLY by the team-assigned turnStart card of the side
        // taking over, so the `turn` event never becomes a card.
        if (event.kind === "turn") return null;
        const isTeamCard = TEAM_EVENT_KINDS.has(event.kind);
        const isHome = event.side === "home";
        const isAway = event.side === "away";
        const team = isAway ? awayTeam : isHome ? homeTeam : null;
        const ref = isAway ? awayRef : isHome ? homeRef : null;
        const oppositeTeam = isAway ? homeTeam : awayTeam;
        const oppositeRef = isAway ? homeRef : awayRef;
        const player = team && event.playerRosterId ? findPlayer(team, event.playerRosterId, ref!) : undefined;
        const minute = deriveMinute(event.at, startedAt ?? 0);
        // The turnStart card is TEAM-assigned (RAU-36/37): it reads "Turno
        // {team}" instead of the generic audit label ("Tu turno").
        const label =
          event.kind === "turnStart" && team ? `Turno ${team.name}` : liveEventLabel(event);
        const iconName: IconName =
          event.kind === "casualty" ? casualtyIcon(event.payload) : EVENT_GLYPH[event.kind] ?? "football";
        const partial = event.kind === "td" ? partialScores.get(event.seq) : undefined;
        const spp = eventSpp(event);
        // MVT-5 actors (only on the wide team cards they belong to).
        const victim =
          isTeamCard && event.kind === "foul" && team
            ? foulVictim(event.payload, oppositeTeam, oppositeRef)
            : null;
        const causeParts =
          isTeamCard && event.kind === "casualty" && team
            ? casualtyCauseParts(event.payload, oppositeTeam, oppositeRef)
            : null;
        const bandSub = event.kind === "casualty" ? bandSubLabel(event.payload) : null;
        const startSub = event.kind === "start" && startedAt != null ? kickoffTime(startedAt) : null;

        const cardBase =
          "rounded-[4px] bg-white py-1.5 px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]";

        if (isTeamCard && team) {
          const gradient = isHome
            ? "bg-[linear-gradient(90deg,rgba(18,34,90,0.12),rgba(255,255,255,0)_45%)]"
            : "bg-[linear-gradient(270deg,rgba(209,25,56,0.12),rgba(255,255,255,0)_45%)]";
          const areas = isHome
            ? "[grid-template-areas:'tag_body_._''tag_body_._'_.body_min]"
            : "[grid-template-areas:'_.body_tag''_.body_tag'min_body_.]";
          // LM-24: the expensive-mistake kickoff row keeps NO turn tag/minute
          // (the preview's team-assigned kickoff row); turnStart keeps the
          // tag + minute corners (RAU-36/37).
          const showCorners = event.kind !== "expensive_mistake";
          return (
            <li
              key={event.seq}
              data-testid="live-event-row"
              className={`w-[68%] max-w-[68%] self-${isHome ? "start" : "end"} grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-x-2 gap-y-0 ${gradient} ${areas} border border-[#e2e8f0] ${cardBase}`}
            >
              {showCorners ? (
                <>
                  {/* Turn tag: grid-area tag (top, own side — home left / away right). */}
                  <span
                    className={`self-start whitespace-nowrap rounded-[3px] px-1.5 py-[1px] text-[10px] font-black text-white [grid-area:tag] ${
                      isAway ? "bg-[#d11938]" : "bg-[#12225a]"
                    }`}
                  >
                    {turnTag(event.half, event.turnNumber)}
                  </span>
                  {/* Minute: grid-area min (bottom, OPPOSITE side). */}
                  <span
                    className={`self-end text-[11px] tabular-nums text-slate-500 [grid-area:min] ${
                      isHome ? "text-right" : "text-left"
                    }`}
                  >
                    {minute}
                  </span>
                </>
              ) : null}
              <div
                className={`flex min-w-0 items-center gap-2 [grid-area:body] ${
                  isAway ? "flex-row-reverse" : ""
                }`}
              >
                {player ? (
                  <>
                    {/* Standalone dorsal column (24px, 13px, 900, slate). */}
                    <span className="w-6 shrink-0 text-center text-[13px] font-black tabular-nums text-slate-500">
                      #{player.dorsal}
                    </span>
                    {/* Helmet token: 30×30 rounded, side tint. */}
                    <span
                      title={player.name}
                      aria-hidden="true"
                      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] ${
                        isHome
                          ? "bg-[rgba(18,34,90,0.13)] text-[#12225a]"
                          : "bg-[rgba(209,25,56,0.11)] text-[#d11938]"
                      }`}
                    >
                      <Icon name="helmet" className="h-[18px] w-[18px]" />
                    </span>
                    {/* Name (800, ink) + position line below (11px slate). */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-[#0f172a]">{player.name}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {positionName(team, player.positionalKey)}
                      </p>
                    </div>
                    {/* Right detail column: event icon + label + SPP stars, then
                        partial score / band sub / victim / cause lines. */}
                    <span
                      className={`flex min-w-0 flex-col ${
                        isHome ? "items-end text-right" : "items-start text-left"
                      }`}
                    >
                      <span className="flex items-center gap-[5px] font-extrabold text-[#0f172a]">
                        <span
                          className={`flex h-[19px] w-[19px] items-center justify-center ${
                            isHome ? "text-[#12225a]" : "text-[#d11938]"
                          }`}
                        >
                          <Icon name={iconName} className="h-[15px] w-[15px]" />
                        </span>
                        {label}
                        {spp > 0 ? (
                          <span className="text-[11px] font-bold text-[#b8860b]">(★{spp})</span>
                        ) : null}
                      </span>
                      {partial ? (
                        <span className="text-[11px] font-bold tabular-nums text-slate-500">
                          ({partial.home} - {partial.away})
                        </span>
                      ) : null}
                      {bandSub ? <span className="text-[11px] text-slate-500">{bandSub}</span> : null}
                      {victim ? (
                        <span className="mt-[1px] flex items-center gap-1 text-[11px] font-bold text-slate-500">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-[4px] ${
                              isHome
                                ? "bg-[rgba(209,25,56,0.14)] text-[#d11938]"
                                : "bg-[rgba(18,34,90,0.16)] text-[#12225a]"
                            }`}
                          >
                            <Icon name="helmet" className="h-2.5 w-2.5" />
                          </span>
                          a {victim.name} (#{victim.dorsal})
                        </span>
                      ) : null}
                      {causeParts && causeParts.cause ? (
                        <p className="mt-[1px] text-[11px] font-bold text-slate-500">
                          {causeParts.causer ? (
                            <>
                              por <b className="font-extrabold text-[#0f172a]">{causeParts.causer.name}</b> (#{causeParts.causer.dorsal}) · {causeParts.cause}
                            </>
                          ) : (
                            causeParts.cause
                          )}
                        </p>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12225a]">
                      <Icon name={iconName} className="h-[15px] w-[15px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-[#0f172a]">{label}</p>
                      {event.kind === "expensive_mistake" ? (
                        <>
                          {outcomeLabel(event.payload) ? (
                            <p className="truncate text-[11px] font-semibold text-[#0f172a]">
                              {outcomeLabel(event.payload)}
                            </p>
                          ) : null}
                          {treasuryLine(event.payload) ? (
                            <p className="truncate text-[11px] tabular-nums text-slate-600">
                              {treasuryLine(event.payload)}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        }

        // Generic centered card: full width, icon left + content flex-1 + right
        // side, no left/right borders (v7). The kickoff-time sub replaces the
        // right minute on the `start` row; endMatch/fan_factor keep it.
        return (
          <li
            key={event.seq}
            data-testid="live-event-row"
            className={`w-full max-w-full self-stretch justify-self-stretch flex items-center gap-[9px] border-x-0 border-y border-[#e2e8f0] ${cardBase}`}
          >
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12225a]">
              <Icon name={iconName} className="h-[15px] w-[15px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold text-[#0f172a]">{label}</p>
              {startSub ? <p className="truncate text-[11px] text-slate-500">{startSub}</p> : null}
              {event.kind === "fan_factor" ? (
                <p className="truncate text-[11px] text-slate-600">{fanTotalsLine(event.payload)}</p>
              ) : null}
            </div>
            {event.kind !== "start" ? (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">
                {minute}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
