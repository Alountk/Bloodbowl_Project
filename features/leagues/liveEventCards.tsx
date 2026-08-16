import { deriveMinute, playerRef, turnTag, derivePartialScore } from "@/lib/liveFeed";
import { CAUSE_LABELS, EVENT_GLYPH, KICKOFF_OUTCOME_LABELS, formatTreasury } from "./liveEventLabels";
import { liveEventLabel, eventSpp } from "./liveEventLabels";
import type { LiveMatchView, MatchTeamDetail } from "./api";

/**
 * The Design-A per-event kind surface that renders as a TEAM card at 68% width
 * (MVT-1): a wide-event usually names a player on one side, so the card sits on
 * that team's side with a navy (home) / red (away) internal gradient. The
 * kickoff `expensive_mistake` is a team card too (MVT-6/LM-24), and `turnStart`
 * is a team card for the side whose turn starts (RAU-36/37). Every other
 * display kind (start/endHalf/endMatch/fan_factor) is a GENERIC event at 100%.
 * The `turn` ("Fin de turno") kind is NOT in the set — it is skipped outright
 * in the render map so the feed never surfaces it (RAU-36/37).
 */
const TEAM_EVENT_KINDS = new Set(["td", "completion", "casualty", "foul", "mvp", "expensive_mistake", "turnStart"]);

/** A roster player lookup for a side: id → { name, dorsal } or undefined. */
type RosterLookup = { name: string; dorsal: number } | undefined;

/** The served players array of a match side, mapped via playerRef (D21). */
function sideLookup(team: MatchTeamDetail): Map<string, number> {
  return playerRef(team.players);
}

function findPlayer(team: MatchTeamDetail, rosterPlayerId: string, ref: Map<string, number>): RosterLookup {
  const p = team.players.find((pl) => pl.rosterPlayerId === rosterPlayerId);
  if (!p) return undefined;
  const dorsal = ref.get(p.rosterPlayerId);
  if (dorsal == null) return undefined;
  return { name: p.name, dorsal };
}

/**
 * MVT-5 foul victim line: "a {name} (#{dorsal})" resolved from the payload's
 * `victimRosterId` against the OPPOSITE roster (LM-12 invariant: the victim of
 * a foul is an opponent). Absent/unresolvable → null (no line, legacy fallback).
 */
export function foulVictimLine(
  payload: Record<string, unknown>,
  oppositeTeam: MatchTeamDetail,
  oppositeRef: Map<string, number>,
): string | null {
  const victimId = payload.victimRosterId;
  if (typeof victimId !== "string") return null;
  const v = findPlayer(oppositeTeam, victimId, oppositeRef);
  return v ? `a ${v.name} (#${v.dorsal})` : null;
}

/**
 * MVT-5 casualty cause+causer line: the causer, when resolved, reads
 * "por {name} (#{dorsal}) · {cause}"; a `crowd` casualty with no causer reads
 * "El público"; a `dodge` (or any causer-less casualty) shows the bare cause
 * label. An unknown cause passes through unchanged (MVT-5, never throws).
 */
export function casualtyCauseLine(
  payload: Record<string, unknown>,
  oppositeTeam: MatchTeamDetail,
  oppositeRef: Map<string, number>,
): string {
  const cause = typeof payload.cause === "string" ? payload.cause : "";
  // Crowd/self-inflicted omit the causer by server invariant (LM-12) — the
  // cause label already IS the whole line ("El público" / "Esquivando — se cayó").
  if (cause === "crowd" || cause === "dodge") {
    return CAUSE_LABELS[cause] ?? cause;
  }
  const causerId = payload.causerRosterId;
  if (typeof causerId === "string") {
    const c = findPlayer(oppositeTeam, causerId, oppositeRef);
    const label = CAUSE_LABELS[cause] ?? cause;
    if (c) return `por ${c.name} (#${c.dorsal}) · ${label}`;
    // Causer present but unresolvable → fall back to the bare cause (never throw).
    return label;
  }
  return CAUSE_LABELS[cause] ?? cause;
}

/** The render-time glyph for a casualty: skull (lasting) vs cross (bruise). */
function casualtyGlyph(payload: Record<string, unknown>): string {
  return typeof payload.band === "string" && payload.band === "bruise" ? "🏥" : "⚰️";
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
 * (LM-24): `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`. A missing/malformed
 * per-team object falls back to a bare `Local: ? · Visitante: ?` marker so the
 * row always renders and never throws.
 */
function fanTotalsLine(payload: Record<string, unknown>): string {
  const people = EVENT_GLYPH.people ?? "👥";
  const dice = EVENT_GLYPH.fan_factor ?? "🎲";
  const fmt = (side: unknown): string => {
    if (typeof side !== "object" || side === null) return "?";
    const o = side as Record<string, unknown>;
    const base = o.base;
    const roll = o.dice;
    const total = o.total;
    const b = typeof base === "number" ? String(base) : "?";
    const d = typeof roll === "number" ? String(roll) : "?";
    const t = typeof total === "number" ? String(total) : "?";
    return `${people}${b} + ${dice}${d} = ${t}`;
  };
  return `Local: ${fmt(payload.home)} · Visitante: ${fmt(payload.away)}`;
}

/**
 * The Tourplay chronology as a card grid (MVT-1/D3): a gray box (`#eef1f6`)
 * with 2px gaps and 4px-radius white cards. Team events sit at 68% with the
 * side gradient and grid-template-areas (turn tag top on the team's side,
 * minute bottom on the opposite side); generic events span 100% centered.
 * `live-event-row` is preserved on each card `li` (spec continuity).
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
      className="flex flex-col gap-0.5 border-t border-[#e2e8f0] bg-[#eef1f6] p-1.5"
    >
      {ordered.map((event) => {
        // RAU-36/37: the generic "Fin de turno" row is noise — the turn change
        // is conveyed ONLY by the team-assigned turnStart card of the side
        // taking over, so the `turn` event never becomes a card.
        if (event.kind === "turn") return null;
        const isTeamCard = TEAM_EVENT_KINDS.has(event.kind);
        const side = event.side;
        const isHome = side === "home";
        const isAway = side === "away";
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
        const glyph =
          event.kind === "casualty"
            ? casualtyGlyph(event.payload)
            : EVENT_GLYPH[event.kind] ?? "•";
        const partial = event.kind === "td" ? partialScores.get(event.seq) : undefined;
        const spp = eventSpp(event);

        // MVT-5 actors (only on the wide team cards they belong to).
        const victim = isTeamCard && event.kind === "foul" && team
          ? foulVictimLine(event.payload, oppositeTeam, oppositeRef)
          : null;
        const causeLine = isTeamCard && event.kind === "casualty" && team
          ? casualtyCauseLine(event.payload, oppositeTeam, oppositeRef)
          : null;

        return (
          <li
            key={event.seq}
            data-testid="live-event-row"
            className={`${
              isTeamCard
                ? `w-[68%] max-w-[68%] self-${isHome ? "start" : "end"} grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-y-0 ${
                    isHome
                      ? "bg-gradient-to-r from-[#12225a]/[0.12] via-[#12225a]/[0.06] to-white"
                      : "bg-gradient-to-l from-[#d11938]/[0.12] via-[#d11938]/[0.06] to-white"
                  } [grid-template-areas:'tag_body_._''tag_body_._'_.body_min]`
                : "w-full max-w-full self-stretch justify-self-stretch flex items-center gap-3"
            } rounded-[4px] border border-[#e2e8f0] bg-white p-1.5 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.05)]`}
          >
            {isTeamCard && team ? (
              <>
                {/* Turn tag: grid-area tag (top, own side — home left / away right). */}
                <span
                  className={`self-start whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white [grid-area:tag] ${
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
                <div
                  className={`flex min-w-0 items-center gap-3 [grid-area:body] ${
                    isAway ? "flex-row-reverse" : ""
                  }`}
                >
                  <span className="shrink-0 text-center" aria-hidden="true">
                    {glyph}
                  </span>
                  {player ? (
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#0f172a]">
                        {player.name}
                        <span className="ml-1 text-[11px] font-semibold text-slate-400">
                          #{player.dorsal}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{label}</p>
                      {partial ? (
                        <p className="text-[11px] font-bold text-[#12225a]">
                          ({partial.home} - {partial.away})
                        </p>
                      ) : null}
                      {victim ? (
                        <p className="truncate text-[11px] font-semibold text-[#b0142f]">{victim}</p>
                      ) : null}
                      {causeLine ? (
                        <p className="truncate text-[11px] font-medium text-slate-600">{causeLine}</p>
                      ) : null}
                      {spp > 0 ? (
                        <p className="text-[11px] font-semibold text-[#b8860b]" aria-label="SPP">
                          ★{spp}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0f172a]">{label}</p>
                      {partial ? (
                        <p className="text-[11px] font-bold text-[#12225a]">
                          ({partial.home} - {partial.away})
                        </p>
                      ) : null}
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
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="shrink-0 text-center" aria-hidden="true">
                  {glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#0f172a]">{label}</p>
                  {event.kind === "fan_factor" ? (
                    <p className="truncate text-[11px] text-slate-600">{fanTotalsLine(event.payload)}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">
                  {minute}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
