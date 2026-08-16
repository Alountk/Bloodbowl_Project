import { Fragment } from "react";
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
  casualtyRollLine,
  casualtyActionLine,
} from "./liveEventLabels";
import { Icon, type IconName } from "./icons";
import type { LiveMatchView, MatchTeamDetail } from "./api";
import styles from "./liveEventCards.module.css";

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
 *
 * LAYOUT SOURCE OF TRUTH: `liveEventCards.module.css`, which ports the
 * duplicate's plain CSS VERBATIM. The previous Tailwind arbitrary-value classes
 * (`[grid-template-areas:'tag_body_._'…]`, `bg-[linear-gradient(…)]`) generated
 * INVALID CSS — Tailwind turns every `_` in an arbitrary value into a space, so
 * the quoted `grid-template-areas` strings collapsed and the declaration was
 * dropped, and the grid then auto-placed children in DOM order (broken layout).
 * A CSS module cannot be mangled that way, so the grid, gradients and per-side
 * mirroring live there; Tailwind remains only for simple utilities.
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
 * RAU-39: derives the ACTION card for a confirmed two-phase casualty — the
 * CAUSER (an OPPONENT of the victim per LM-12) rendered on the causer's side
 * with the cause label and the band/roll sub-line. Self-inflicted casualties
 * (dodge/crowd) carry no causer → null; an unresolvable causer also returns
 * null (never throws).
 */
function deriveActionCard(
  event: LiveMatchView["events"][number],
  causerTeam: MatchTeamDetail,
  causerRef: Map<string, number>,
): { player: Exclude<RosterLookup, undefined>; label: string; sub: string | null } | null {
  const causerId = event.payload.causerRosterId;
  if (typeof causerId !== "string") return null;
  const player = findPlayer(causerTeam, causerId, causerRef);
  if (!player) return null;
  const cause = typeof event.payload.cause === "string" ? event.payload.cause : "";
  return {
    player,
    label: CAUSE_LABELS[cause] ?? cause,
    sub: casualtyActionLine(event.payload),
  };
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

/**
 * RAU-38 concede sub-line for the centered card: "{surrendering team} se rinde
 * · Victoria de {acceptor team}". The surrendering side is the event `side` and
 * the acceptor comes from `payload.winnerSide` (both set server-side); either
 * unresolved → null (bare label only, never throws).
 */
function concedeLine(
  event: LiveMatchView["events"][number],
  homeTeam: MatchTeamDetail,
  awayTeam: MatchTeamDetail,
): string | null {
  const surrenderTeam = event.side === "away" ? awayTeam : event.side === "home" ? homeTeam : null;
  const winnerSide = event.payload.winnerSide;
  const winnerTeam = winnerSide === "away" ? awayTeam : winnerSide === "home" ? homeTeam : null;
  if (!surrenderTeam || !winnerTeam) return null;
  return `${surrenderTeam.name} se rinde · Victoria de ${winnerTeam.name}`;
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
  // Module class map: kebab-case CSS source keys → readable locals (the class
  // names come straight from the duplicate, so the rendered markup mirrors it).
  const c = {
    ev: styles.ev,
    home: styles["ev--home"],
    away: styles["ev--away"],
    center: styles["ev--center"],
    turnTag: styles["turn-tag"],
    turnTagHome: styles["turn-tag--home"],
    turnTagAway: styles["turn-tag--away"],
    minute: styles.minute,
    cardBody: styles["card-body"],
    kbody: styles.kbody,
    token: styles.token,
    tokenHome: styles["token--home"],
    tokenAway: styles["token--away"],
    dorsal: styles.dorsal,
    who: styles.who,
    name: styles.name,
    pos: styles.pos,
    detail: styles.detail,
    dline: styles.dline,
    dlineHome: styles["dline--home"],
    dlineAway: styles["dline--away"],
    dicon: styles.dicon,
    stars: styles.stars,
    scoreNote: styles["score-note"],
    sub: styles.sub,
    victimLine: styles["victim-line"],
    vtoken: styles.vtoken,
    vtokenHome: styles["vtoken--home"],
    vtokenAway: styles["vtoken--away"],
    causeLine: styles["cause-line"],
    kcicon: styles.kcicon,
    kciconHome: styles["kcicon--home"],
    kciconAway: styles["kcicon--away"],
    kwho: styles.kwho,
    ktitle: styles.ktitle,
    ksub: styles.ksub,
    ktreasury: styles.ktreasury,
    cicon: styles.cicon,
    cbody: styles.cbody,
    ctitle: styles.ctitle,
    csub: styles.csub,
    ffLine: styles["ff-line"],
    cright: styles.cright,
  };

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
        // RAU-39: the injury card's roll line ("Tirada 1D16: {roll16}") — the
        // band is server-derived from this roll, shown as the sub-line/cause.
        const rollLine = event.kind === "casualty" ? casualtyRollLine(event.payload) : null;
        // RAU-39: the DERIVED action card on the CAUSER's side — the causer is
        // an OPPONENT of the victim (LM-12), so it renders on the OPPOSITE team
        // with the cause label + the band/roll sub-line. Self-inflicted
        // (dodge/crowd) casualties have no causer → no action card.
        const actionCard =
          isTeamCard && event.kind === "casualty" && oppositeTeam ? deriveActionCard(event, oppositeTeam, oppositeRef) : null;
        // Kickoff wall-clock subs: the `start` row from the kickoff anchor (omitted
        // gracefully when the data is unavailable), the `endMatch` row from its own
        // event timestamp. NOTE (v7): the preview's `ctv-strip` on the start card is
        // intentionally NOT rendered — live events carry no team-value data here.
        const startSub = event.kind === "start" && startedAt != null ? wallClockTime(startedAt) : null;
        const endSub = event.kind === "endMatch" ? wallClockTime(event.at) : null;
        const concedeSub =
          event.kind === "concede" ? concedeLine(event, homeTeam, awayTeam) : null;

        if (isTeamCard && team) {
          // LM-24: the expensive-mistake kickoff row keeps NO turn tag/minute
          // (the preview's team-assigned kickoff row); turnStart keeps the
          // tag + minute corners (RAU-36/37).
          const showCorners = event.kind !== "expensive_mistake";
          return (
            <Fragment key={event.seq}>
            <li
              key={event.seq}
              data-testid="live-event-row"
              className={`${c.ev} ${isHome ? c.home : c.away}`}
            >
              {showCorners ? (
                <>
                  {/* Turn tag: grid-area tag (top, own side — home left / away right). */}
                  <span className={`${c.turnTag} ${isAway ? c.turnTagAway : c.turnTagHome}`}>
                    {turnTag(event.half, event.turnNumber)}
                  </span>
                  {/* Minute: grid-area min (bottom, OPPOSITE side). */}
                  <span className={c.minute}>{minute}</span>
                </>
              ) : null}

              {/* turnStart team card (RAU-36/37): token + team line + hand detail,
                  no dorsal — exactly the validated card. */}
              {event.kind === "turnStart" ? (
                <div className={c.cardBody}>
                  <span
                    aria-hidden="true"
                    className={`${c.token} ${isAway ? c.tokenAway : c.tokenHome}`}
                  >
                    <Icon name={iconName} className="h-[18px] w-[18px]" />
                  </span>
                  <div className={c.who}>
                    <p className={c.name}>{label}</p>
                    <p className={c.pos}>Empieza el turno</p>
                  </div>
                  <span className={c.detail}>
                    <span className={`${c.dline} ${isHome ? c.dlineHome : c.dlineAway}`}>
                      <span className={c.dicon}>
                        <Icon name={iconName} className="h-[15px] w-[15px]" />
                      </span>
                      {label}
                    </span>
                  </span>
                </div>
              ) : event.kind === "expensive_mistake" ? (
                // LM-24: no turn tag/minute/player — money-bag icon + title +
                // "{team} · {outcome}" + treasury before → after.
                <div className={c.kbody}>
                  <span
                    aria-hidden="true"
                    className={`${c.kcicon} ${isAway ? c.kciconAway : c.kciconHome}`}
                  >
                    <Icon name="money-bag" className="h-[18px] w-[18px]" />
                  </span>
                  <div className={c.kwho}>
                    <p className={c.ktitle}>{label}</p>
                    {outcomeLabel(event.payload) ? (
                      <p className={c.ksub}>
                        {team.name} · {outcomeLabel(event.payload)}
                      </p>
                    ) : null}
                    {treasuryLine(event.payload) ? (
                      <p className={c.ktreasury}>{treasuryLine(event.payload)}</p>
                    ) : null}
                  </div>
                </div>
              ) : player ? (
                /* The standard player team card: token (30×30, own-side tint) →
                   dorsal (#n) → who (name + position) → detail (icon + label +
                   SPP stars, then partial score / band sub / victim / cause). */
                <div className={c.cardBody}>
                  <span
                    title={player.name}
                    aria-hidden="true"
                    className={`${c.token} ${isAway ? c.tokenAway : c.tokenHome}`}
                  >
                    <Icon name="helmet" className="h-[18px] w-[18px]" />
                  </span>
                  {/* Standalone dorsal column (24px, 13px, 900, slate). */}
                  <span className={c.dorsal}>#{player.dorsal}</span>
                  {/* Name (800, ink) + position line below (11px slate). */}
                  <div className={c.who}>
                    <p className={c.name}>{player.name}</p>
                    <p className={c.pos}>{positionName(team, player.positionalKey)}</p>
                  </div>
                  {/* Right detail column: event icon + label + SPP stars, then
                      partial score / band sub / victim / cause lines. */}
                  <span className={c.detail}>
                    <span className={`${c.dline} ${isHome ? c.dlineHome : c.dlineAway}`}>
                      <span className={c.dicon}>
                        <Icon name={iconName} className="h-[15px] w-[15px]" />
                      </span>
                      {label}
                      {spp > 0 ? <span className={c.stars}>(★{spp})</span> : null}
                    </span>
                    {partial ? (
                      <span className={c.scoreNote}>
                        ({partial.home} - {partial.away})
                      </span>
                    ) : null}
                    {bandSub ? <span className={c.sub}>{bandSub}</span> : null}
                    {rollLine ? <span className={c.sub}>{rollLine}</span> : null}
                    {victim ? (
                      <span className={c.victimLine}>
                        {/* The victim is on the OPPOSITE side (LM-12), so the mini
                            token carries the rival tint. */}
                        <span className={`${c.vtoken} ${isHome ? c.vtokenAway : c.vtokenHome}`}>
                          <Icon name="helmet" className="h-2.5 w-2.5" />
                        </span>
                        a {victim.name} (#{victim.dorsal})
                      </span>
                    ) : null}
                    {causeParts && causeParts.cause ? (
                      <p className={c.causeLine}>
                        {causeParts.causer ? (
                          <>
                            por <b>{causeParts.causer.name}</b> (#{causeParts.causer.dorsal}) · {causeParts.cause}
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
                <div className={c.cardBody}>
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#12225a]">
                    <Icon name={iconName} className="h-[15px] w-[15px]" />
                  </span>
                  <p className="min-w-0 flex-1 truncate font-extrabold text-[#0f172a]">{label}</p>
                </div>
              )}
            </li>
            {/* RAU-39: the DERIVED action card on the CAUSER's side — the same
                casualty event feeds BOTH the injury card (victim, above) and
                this action card (causer + cause + roll/band sub-line). The
                causer is on the OPPOSITE side of the victim (LM-12), so the
                card mirrors with the rival tint and its own turn/minute. */}
            {actionCard ? (
              <li
                key={`${event.seq}-action`}
                data-testid="live-event-row"
                className={`${c.ev} ${event.side === "home" ? c.away : c.home}`}
              >
                {showCorners ? (
                  <>
                    <span className={`${c.turnTag} ${event.side === "home" ? c.turnTagAway : c.turnTagHome}`}>
                      {turnTag(event.half, event.turnNumber)}
                    </span>
                    <span className={c.minute}>{minute}</span>
                  </>
                ) : null}
                <div className={c.cardBody}>
                  <span
                    title={actionCard.player.name}
                    aria-hidden="true"
                    className={`${c.token} ${event.side === "home" ? c.tokenAway : c.tokenHome}`}
                  >
                    <Icon name="helmet" className="h-[18px] w-[18px]" />
                  </span>
                  <span className={c.dorsal}>#{actionCard.player.dorsal}</span>
                  <div className={c.who}>
                    <p className={c.name}>{actionCard.player.name}</p>
                    <p className={c.pos}>{positionName(oppositeTeam, actionCard.player.positionalKey)}</p>
                  </div>
                  <span className={c.detail}>
                    <span className={`${c.dline} ${event.side === "away" ? c.dlineHome : c.dlineAway}`}>
                      <span className={c.dicon}>
                        <Icon name={iconName} className="h-[15px] w-[15px]" />
                      </span>
                      {actionCard.label}
                    </span>
                    {actionCard.sub ? <span className={c.sub}>{actionCard.sub}</span> : null}
                  </span>
                </div>
              </li>
            ) : null}
            </Fragment>
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
            className={`${c.ev} ${c.center}`}
          >
            <span className={c.cicon}>
              <Icon name={iconName} className="h-[15px] w-[15px]" />
            </span>
            <div className={c.cbody}>
              <p className={c.ctitle}>{label}</p>
              {startSub ? <p className={c.csub}>{startSub}</p> : null}
              {endSub ? <p className={c.csub}>{endSub}</p> : null}
              {concedeSub ? <p className={c.csub}>{concedeSub}</p> : null}
              {event.kind === "fan_factor" ? (
                <p className={c.ffLine}>{fanTotalsLine(event.payload)}</p>
              ) : null}
            </div>
            {event.kind === "endMatch" || event.kind === "endHalf" ? (
              <span className={c.cright}>{minute}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
