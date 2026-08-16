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
 * The validated Tourplay v7 card set (`previews/cards-tourplay-duplicado.html`).
 * A wide-event usually names a player on one side, so it renders as a TEAM card
 * at 68% width sitting on that team's side with a navy (home) / red (away)
 * gradient and mirrored grid corners (turn tag top on the team's side, minute
 * bottom on the opposite side). The kickoff `expensive_mistake` is a team card
 * too (LM-24, no turn tag/minute/player — kbody with money-bag + outcome +
 * treasury). `turnStart` is a team card for the side whose turn starts
 * (RAU-36/37): token + "Turno {team}" / "Empieza el turno" + hand detail line,
 * no dorsal. Every other display kind (start/endHalf/endMatch/fan_factor) is a
 * GENERIC event card at 100% (icon left + content flex-1 + optional right data).
 * The `turn` ("Fin de turno") kind is NOT in the set — it is skipped outright
 * (RAU-36/37).
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

/** The wall-clock HH:MM sub-line for the start / endMatch rows (v7). */
function wallClockTime(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The Tourplay chronology as a card grid (validated v7): a gray box (`#eef1f6`)
 * with a full 1px border, `12px 14px` inner padding and 2px gaps. Team events
 * sit at 68% with the side gradient and grid-template-areas (turn tag top on the
 * team's side, minute bottom on the opposite side); generic events span 100%
 * left-aligned with the icon left + expanded content + a right side.
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
        // Kickoff wall-clock subs: the `start` row from the kickoff anchor (omitted
        // gracefully when the data is unavailable), the `endMatch` row from its own
        // event timestamp. NOTE (v7): the preview's `ctv-strip` on the start card is
        // intentionally NOT rendered — live events carry no team-value data here.
        const startSub = event.kind === "start" && startedAt != null ? wallClockTime(startedAt) : null;
        const endSub = event.kind === "endMatch" ? wallClockTime(event.at) : null;

        const cardBase =
          "rounded-[4px] bg-white py-1.5 px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]";

        if (isTeamCard && team) {
          const gradient = isHome
            ? "bg-[linear-gradient(90deg,rgba(18,34,90,0.12),rgba(255,255,255,0)_45%)]"
            : "bg-[linear-gradient(270deg,rgba(209,25,56,0.12),rgba(255,255,255,0)_45%)]";
          const areas = isHome
            ? "[grid-template-areas:'tag_body_._''tag_body_._'_.body_min]"
            : "[grid-template-areas:'_.body_tag''_.body_tag'min_body_.]";
          const sideClass = isAway ? "turn-tag--away bg-[#d11938]" : "turn-tag--home bg-[#12225a]";
          const tinted = isAway
            ? "bg-[rgba(209,25,56,0.11)] text-[#d11938]"
            : "bg-[rgba(18,34,90,0.13)] text-[#12225a]";
          // The foul victim is on the OPPOSITE side (LM-12), so its mini token
          // carries the RIVAL tint (home card → red victim, away card → navy).
          const victimTint = isAway
            ? "bg-[rgba(18,34,90,0.13)] text-[#12225a]"
            : "bg-[rgba(209,25,56,0.11)] text-[#d11938]";
          // LM-24: the expensive-mistake kickoff row keeps NO turn tag/minute
          // (the preview's team-assigned kickoff row); turnStart keeps the
          // tag + minute corners (RAU-36/37).
          const showCorners = event.kind !== "expensive_mistake";
          return (
            <li
              key={event.seq}
              data-testid="live-event-row"
              className={`ev w-[68%] max-w-[68%] self-${isHome ? "start" : "end"} grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-x-2 gap-y-0 ${gradient} ${areas} border border-[#e2e8f0] ${cardBase}`}
            >
              {showCorners ? (
                <>
                  {/* Turn tag: grid-area tag (top, own side — home left / away right). */}
                  <span
                    className={`turn-tag ${sideClass} self-start whitespace-nowrap rounded-[3px] px-1.5 py-[1px] text-[10px] font-black text-white [grid-area:tag]`}
                  >
                    {turnTag(event.half, event.turnNumber)}
                  </span>
                  {/* Minute: grid-area min (bottom, OPPOSITE side). */}
                  <span
                    className={`minute self-end text-[11px] tabular-nums text-slate-500 [grid-area:min] ${
                      isHome ? "text-right" : "text-left"
                    }`}
                  >
                    {minute}
                  </span>
                </>
              ) : null}

              {/* turnStart team card (RAU-36/37): token + team line + hand detail,
                  no dorsal — exactly the validated card. */}
              {event.kind === "turnStart" ? (
                <div
                  className={`card-body flex min-w-0 items-center gap-2 [grid-area:body] ${
                    isAway ? "flex-row-reverse" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`token ${isAway ? "token--away" : "token--home"} ${tinted} flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px]`}
                  >
                    <Icon name={iconName} className="h-[18px] w-[18px]" />
                  </span>
                  <div className={`who min-w-0 flex-1 ${isAway ? "text-right" : ""}`}>
                    <p className="name truncate font-extrabold text-[#0f172a]">{label}</p>
                    <p className="pos truncate text-[11px] text-slate-500">Empieza el turno</p>
                  </div>
                  <span
                    className={`detail flex min-w-0 flex-col ${
                      isHome ? "items-end text-right" : "items-start text-left"
                    }`}
                  >
                    <span className="dline flex items-center gap-[5px] font-extrabold text-[#0f172a]">
                      <span
                        className={`dicon flex h-[19px] w-[19px] items-center justify-center ${
                          isHome ? "text-[#12225a]" : "text-[#d11938]"
                        }`}
                      >
                        <Icon name={iconName} className="h-[15px] w-[15px]" />
                      </span>
                      {label}
                    </span>
                  </span>
                </div>
              ) : event.kind === "expensive_mistake" ? (
                // LM-24: no turn tag/minute/player — money-bag icon + title +
                // "{team} · {outcome}" + treasury before → after.
                <div
                  className={`kbody flex min-w-0 items-center gap-2 [grid-area:body] ${
                    isAway ? "flex-row-reverse" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`kcicon ${isAway ? "kcicon--away" : "kcicon--home"} ${tinted} flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px]`}
                  >
                    <Icon name="money-bag" className="h-[18px] w-[18px]" />
                  </span>
                  <div className={`kwho min-w-0 flex-1 ${isAway ? "text-right" : ""}`}>
                    <p className="ktitle truncate text-[13px] font-extrabold text-[#0f172a]">{label}</p>
                    {outcomeLabel(event.payload) ? (
                      <p className="ksub truncate text-[11px] text-slate-500">
                        {team.name} · {outcomeLabel(event.payload)}
                      </p>
                    ) : null}
                    {treasuryLine(event.payload) ? (
                      <p className="ktreasury truncate text-[11px] font-bold tabular-nums text-slate-500">
                        {treasuryLine(event.payload)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : player ? (
                /* The standard player team card: token (30×30, own-side tint) →
                   dorsal (#n) → who (name + position) → detail (icon + label +
                   SPP stars, then partial score / band sub / victim / cause). */
                <div
                  className={`card-body flex min-w-0 items-center gap-2 [grid-area:body] ${
                    isAway ? "flex-row-reverse" : ""
                  }`}
                >
                  <span
                    title={player.name}
                    aria-hidden="true"
                    className={`token ${isAway ? "token--away" : "token--home"} ${tinted} flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px]`}
                  >
                    <Icon name="helmet" className="h-[18px] w-[18px]" />
                  </span>
                  {/* Standalone dorsal column (24px, 13px, 900, slate). */}
                  <span className="dorsal w-6 shrink-0 text-center text-[13px] font-black text-slate-500">
                    #{player.dorsal}
                  </span>
                  {/* Name (800, ink) + position line below (11px slate). */}
                  <div className={`who min-w-0 flex-1 ${isAway ? "text-right" : ""}`}>
                    <p className="name truncate font-extrabold text-[#0f172a]">{player.name}</p>
                    <p className="pos truncate text-[11px] text-slate-500">
                      {positionName(team, player.positionalKey)}
                    </p>
                  </div>
                  {/* Right detail column: event icon + label + SPP stars, then
                      partial score / band sub / victim / cause lines. */}
                  <span
                    className={`detail flex min-w-0 flex-col ${
                      isHome ? "items-end text-right" : "items-start text-left"
                    }`}
                  >
                    <span className="dline flex items-center gap-[5px] font-extrabold text-[#0f172a]">
                      <span
                        className={`dicon flex h-[19px] w-[19px] items-center justify-center ${
                          isHome ? "text-[#12225a]" : "text-[#d11938]"
                        }`}
                      >
                        <Icon name={iconName} className="h-[15px] w-[15px]" />
                      </span>
                      {label}
                      {spp > 0 ? (
                        <span className="stars text-[11px] font-bold text-[#b8860b]">(★{spp})</span>
                      ) : null}
                    </span>
                    {partial ? (
                      <span className="score-note text-[11px] font-bold tabular-nums text-slate-500">
                        ({partial.home} - {partial.away})
                      </span>
                    ) : null}
                    {bandSub ? <span className="sub text-[11px] text-slate-500">{bandSub}</span> : null}
                    {victim ? (
                      <span
                        className={`victim-line mt-[1px] flex items-center gap-1 text-[11px] font-bold text-slate-500 ${
                          isHome ? "justify-end" : "justify-start"
                        }`}
                      >
                        {/* The victim is on the OPPOSITE side (LM-12), so the mini
                            token carries the rival tint. */}
                        <span
                          className={`vtoken ${
                            isHome ? "vtoken--away" : "vtoken--home"
                          } ${victimTint} flex h-4 w-4 items-center justify-center rounded-[4px]`}
                        >
                          <Icon name="helmet" className="h-2.5 w-2.5" />
                        </span>
                        a {victim.name} (#{victim.dorsal})
                      </span>
                    ) : null}
                    {causeParts && causeParts.cause ? (
                      <p className="cause-line mt-[1px] text-[11px] font-bold text-slate-500">
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
                </div>
              ) : (
                /* Defensive fallback for a player-less team card (unresolvable
                   roster): the label only, never throws. */
                <div
                  className={`card-body flex min-w-0 items-center gap-2 [grid-area:body] ${
                    isAway ? "flex-row-reverse" : ""
                  }`}
                >
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12225a]">
                    <Icon name={iconName} className="h-[15px] w-[15px]" />
                  </span>
                  <p className="min-w-0 flex-1 truncate font-extrabold text-[#0f172a]">{label}</p>
                </div>
              )}
            </li>
          );
        }

        // Generic centered card: full width, icon left + content flex-1 + right
        // data, no left/right borders (v7). The `start` row shows the kickoff
        // wall-clock sub (no right minute); endMatch/endHalf show the minute;
        // fan_factor carries no right data.
        return (
          <li
            key={event.seq}
            data-testid="live-event-row"
            className={`ev ev--center w-full max-w-full self-stretch justify-self-stretch flex items-center border-x-0 border-y border-[#e2e8f0] ${cardBase}`}
          >
            <span className="cicon flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12225a]">
              <Icon name={iconName} className="h-[15px] w-[15px]" />
            </span>
            <div className="cbody min-w-0 flex-1">
              <p className="ctitle truncate font-extrabold text-[#0f172a]">{label}</p>
              {startSub ? <p className="csub mt-[1px] truncate text-[11px] text-slate-500">{startSub}</p> : null}
              {endSub ? <p className="csub mt-[1px] truncate text-[11px] text-slate-500">{endSub}</p> : null}
              {event.kind === "fan_factor" ? (
                <p className="ff-line mt-[3px] truncate text-[11px] font-semibold tabular-nums text-[#0f172a]">
                  {fanTotalsLine(event.payload)}
                </p>
              ) : null}
            </div>
            {event.kind === "endMatch" || event.kind === "endHalf" ? (
              <span className="cright shrink-0 text-[11px] font-bold tabular-nums text-slate-500">
                {minute}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
