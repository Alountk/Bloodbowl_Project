import { Fragment } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { deriveMinute, playerRef, turnTag, derivePartialScore } from "@/lib/liveFeed";
import { ACK_TIMEOUT_MS, eventAuthorSide, isAckableKind } from "@/lib/livePhase";
import {
  causeLabel,
  outcomeLabel,
  EVENT_GLYPH,
  formatTreasury,
  liveEventLabel,
  eventSpp,
  casualtyIcon,
  bandSubLabel,
  casualtyRollLine,
  casualtyActionLine,
  journeymanJoinLabel,
  bothDownMarkerLabel,
  type TFunc,
} from "./liveEventLabels";
import { Icon, type IconName } from "./icons";
import type { LiveMatchView, MatchTeamDetail } from "./api";
import styles from "./liveEventCards.module.css";

/**
 * The validated COMPACT live event card set (`bloodbowl_designs/
 * timeline-action-entry-designs.html`, the "mini rows" study). Every display
 * event renders as a WHITE full-width card on the `#f8fafc` token feed shell,
 * read left → right at every viewport: token/dorsal + name + label + optional
 * sub-lines on one row, with the turn-tag + minute as inline meta. TEAM events
 * (usually naming a player on one side) carry a 3px left side accent at the
 * navy/red opacity tokens (home `rgba(18,34,90,.18)` / away `rgba(209,25,56,.18)`)
 * plus the per-side token/tag colors. The kickoff `expensive_mistake` is a team
 * card too (LM-24, no turn tag/minute/player — kbody with money-bag + outcome +
 * treasury). `turnStart` is a team card for the side whose turn starts
 * (RAU-36/37): token + "Turno {team}" / "Empieza el turno", no dorsal and no
 * right-hand `.detail` repetition (the label renders once, in `.name`). Every
 * other display kind (start/endHalf/endMatch/fan_factor/concede) is a GENERIC
 * centered card at full width (icon left + content + optional right minute).
 * The `turn` ("Fin de turno") kind is NOT in the set — it is skipped outright
 * (RAU-36/37).
 *
 * LAYOUT SOURCE OF TRUTH: `liveEventCards.module.css` (plain CSS module). The
 * earlier Tailwind arbitrary-value classes (`[grid-template-areas:…]`,
 * `bg-[linear-gradient(…)]`) generated INVALID CSS because Tailwind turns every
 * `_` inside an arbitrary value into a space, collapsing the quoted area
 * strings; the geometry therefore lives in the module, where it cannot be
 * mangled, and Tailwind only supplies simple spacing/alignment utilities.
 */
const TEAM_EVENT_KINDS = new Set(["td", "completion", "casualty", "foul", "mvp", "expensive_mistake", "turnStart", "journeyman"]);

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
  fn: TFunc,
): { causer: { name: string; dorsal: number } | null; cause: string } {
  const cause = typeof payload.cause === "string" ? payload.cause : "";
  // Crowd/self-inflicted omit the causer by server invariant (LM-12) — the
  // cause label already IS the whole line ("El público" / "Esquivando — se cayó").
  if (cause === "crowd" || cause === "dodge") {
    return { causer: null, cause: causeLabel(cause, fn) };
  }
  const causerId = payload.causerRosterId;
  if (typeof causerId === "string") {
    const c = findPlayer(oppositeTeam, causerId, oppositeRef);
    const label = causeLabel(cause, fn);
    if (c) return { causer: { name: c.name, dorsal: c.dorsal }, cause: label };
    // Causer present but unresolvable → fall back to the bare cause (never throw).
    return { causer: null, cause: label };
  }
  return { causer: null, cause: causeLabel(cause, fn) };
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
  victimTeam: MatchTeamDetail,
  victimRef: Map<string, number>,
  fn: TFunc,
): { player: Exclude<RosterLookup, undefined>; label: string; sub: string | null } | null {
  const causerId = event.payload.causerRosterId;
  if (typeof causerId !== "string") return null;
  const player = findPlayer(causerTeam, causerId, causerRef);
  if (!player) return null;
  const cause = typeof event.payload.cause === "string" ? event.payload.cause : "";
  // The action card reads "{causer} hace una herida a {victim}": the causer
  // earns the SPP stars, so the victim's NAME rides here; the ROLL + band stay
  // on the injury card (victim side).
  const victimId = typeof event.payload.victimRosterId === "string" ? event.payload.victimRosterId : null;
  const victim = victimId ? findPlayer(victimTeam, victimId, victimRef) : undefined;
  return {
    player,
    label: causeLabel(cause, fn),
    sub: victim ? casualtyActionLine(event.payload, player.name, victim.name, fn) : null,
  };
}

/**
 * The es-ES treasury before → after line for an `expensive_mistake` card
 * (LM-24), e.g. "234.000 → 214.000 M.O.". Returns null when either field is
 * missing/non-numeric so the caller renders the label WITHOUT the line and
 * never throws (LM-24 fallback).
 */
function treasuryLine(payload: Record<string, unknown>, fn: TFunc): string | null {
  const before = payload.treasuryBefore;
  const after = payload.treasuryAfter;
  if (typeof before !== "number" || typeof after !== "number") return null;
  // es-ES dot-thousands BEFORE (no suffix) → formatTreasury AFTER (carries the
  // single trailing " M.O."), per LM-24 "234.000 → 214.000 M.O.".
  const beforeText = new Intl.NumberFormat("es-ES").format(before);
  return `${beforeText} → ${formatTreasury(after, fn)}`;
}

/**
 * The compact per-team fan-factor copy for the centered `fan_factor` row
 * (LM-24, kept verbatim): `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`.
 * A missing/malformed per-team object falls back to a bare `Local: ? ·
 * Visitante: ?` marker so the row always renders and never throws.
 */
function fanTotalsLine(payload: Record<string, unknown>, fn: TFunc): string {
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
  return fn("match.fanTotals", { home: fmt(payload.home), away: fmt(payload.away) });
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
  fn: TFunc,
): string | null {
  const surrenderTeam = event.side === "away" ? awayTeam : event.side === "home" ? homeTeam : null;
  const winnerSide = event.payload.winnerSide;
  const winnerTeam = winnerSide === "away" ? awayTeam : winnerSide === "home" ? homeTeam : null;
  if (!surrenderTeam || !winnerTeam) return null;
  return fn("match.concedeLine", { team: surrenderTeam.name, winner: winnerTeam.name });
}

/** The wall-clock HH:MM sub-line for the start / endMatch rows (v7). */
function wallClockTime(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Design B (RAU-82): the non-blocking acknowledgement row on an event card.
 * The event is consumed instantly; the RIVAL marks it ✓ (seen & correct) or
 * ✗ (discrepancy) — informational only, the match never waits. If the rival
 * does not respond, the card auto-verifies after `ACK_TIMEOUT_MS`. The AUTHOR
 * (and spectators) only see the status badge.
 *
 * KIND GATE (mobile bugfix): the cotejo applies ONLY to events a coach records
 * that the rival must verify — `td`/`completion`/`casualty`/`foul`. System and
 * state cards (`turnStart`, `start`, `endHalf`, `endMatch`, `turn`,
 * `requestTurn`, `mvp`, `expensive_mistake`, `fan_factor`, `journeyman`,
 * `concede`) have no recorder-author to verify → this row returns null (no ✓/✗
 * AND no status badge), matching the shared `ACKABLE_KINDS` server gate.
 */
function EventAckRow({
  event,
  viewerSide,
  now,
  onAck,
}: {
  event: LiveMatchView["events"][number];
  viewerSide: "home" | "away" | null;
  /** The current wall-clock (ms), passed in so auto-verify never calls the
   * impure `Date.now()` during render (React purity rule). */
  now: number;
  onAck: (eventSeq: number, status: "ok" | "nok") => void;
}) {
  const { t } = useI18n();
  // Non-ackable kind → no ack row and no badge on this card at all.
  if (!isAckableKind(event.kind)) return null;
  // D2/LM-26: the ack author is payload-aware — a casualty's author is its
  // CAUSER (opposite the victim side). A CAUSER-LESS casualty (self-inflicted
  // dodge/crowd) has no author → no ✓/✗ ever renders (auto-verify only).
  const payloadCauser = typeof event.payload.causerRosterId === "string" ? event.payload.causerRosterId : null;
  const author = eventAuthorSide(event.kind, event.side, payloadCauser);
  const ack = event.ackStatus ?? "pending";
  const auto = ack === "pending" && now - event.at > ACK_TIMEOUT_MS;
  const status = auto ? "auto" : ack;
  // No author (author null is only reachable via a causer-less casualty or a
  // side-less generic) → nobody is the rival → badge branch only.
  const isRival = author !== null && viewerSide !== null && viewerSide !== author;

  const badgeClass =
    status === "ok" || status === "auto"
      ? "border-[#c6e9d0] bg-[#e6f6ea] text-[#1a7f37]"
      : status === "nok"
        ? "border-[#f3c6cd] bg-[#fef2f2] text-[#c0392b]"
        : "border-[#e2e8f0] bg-[#f1f5f9] text-[#64748b]";
  const badgeText =
    status === "ok"
      ? t("match.ack.ok")
      : status === "nok"
        ? t("match.ack.nok")
        : status === "auto"
          ? t("match.ack.auto")
          : t("match.ack.pending");

  if (!isRival || status !== "pending") {
    return (
      <div className={`${styles["ack-row"]} mt-1 flex items-center justify-end`}>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
    );
  }

  return (
    <div className={`${styles["ack-row"]} mt-1 flex items-center justify-end gap-1.5`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
        {t("match.ack.pending")}
      </span>
      <button
        type="button"
        onClick={() => onAck(event.seq, "ok")}
        className="rounded border border-[#c6e9d0] bg-white px-2 py-0.5 text-[10px] font-bold text-[#1a7f37] hover:bg-[#e6f6ea]"
      >
        {t("match.ack.okAction")}
      </button>
      <button
        type="button"
        onClick={() => onAck(event.seq, "nok")}
        className="rounded border border-[#f3c6cd] bg-white px-2 py-0.5 text-[10px] font-bold text-[#c0392b] hover:bg-[#fef2f2]"
      >
        {t("match.ack.nokAction")}
      </button>
    </div>
  );
}

/**
 * The compact event feed: a single full-width column on the `#f8fafc` token
 * shell. Each event card (`li.live-event-row`) is a WHITE full-width card at
 * every viewport (team events carry a 3px left side accent; generic events are
 * centered with no accent), with the turn-tag + minute as inline meta — no 68%
 * split, no side gradients, no corner grid, and no width media override.
 * `live-event-row` is preserved on each card `li` (spec continuity).
 */
export function LiveEventCards({
  events,
  startedAt,
  homeTeam,
  awayTeam,
  viewerSide,
  now,
  onAck,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** The session coach's side (D19): drives who sees the ✓/✗ ack buttons. */
  viewerSide: "home" | "away" | null;
  /** Current wall-clock (ms) for the non-blocking auto-verify derivation. */
  now: number;
  /** Fires `acknowledgeEvent` for the rival's ✓/✗ (informational only). */
  onAck: (eventSeq: number, status: "ok" | "nok") => void;
}) {
  const { t } = useI18n();
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
      aria-label={t("match.chronologyAria")}
      className="flex flex-col gap-1.5 bg-[#f8fafc]"
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
        // {team}" instead of the generic audit label ("Tu turno"). The
        // journeyman card (RAU-13) overrides the generic "Novato" kind label
        // with the join line "{name} se une como novato".
        const label =
          event.kind === "turnStart" && team
            ? t("match.turnOfTeam", { team: team.name })
            : event.kind === "journeyman" && team
              ? (journeymanJoinLabel(event.payload, t) ?? liveEventLabel(event, t))
              : liveEventLabel(event, t);
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
            ? casualtyCauseParts(event.payload, oppositeTeam, oppositeRef, t)
            : null;
        const bandSub = event.kind === "casualty" ? bandSubLabel(event.payload, t) : null;
        // b5: the "(Ambos derribados)" marker copy — only on the non-active
        // coach's both-down block record (D1); a plain defender block card (no
        // marker) and every other casualty render no suffix.
        const bothDownMarker = event.kind === "casualty" ? bothDownMarkerLabel(event.payload, t) : null;
        // RAU-39: the injury card's roll line ("Tirada 1D16: {roll16}") — the
        // band is server-derived from this roll, shown as the sub-line/cause.
        const rollLine = event.kind === "casualty" ? casualtyRollLine(event.payload, t) : null;
        // RAU-39: the DERIVED action card on the CAUSER's side — the causer is
        // an OPPONENT of the victim (LM-12), so it renders on the OPPOSITE team
        // with the cause label + the band/roll sub-line. Self-inflicted
        // (dodge/crowd) casualties have no causer → no action card.
        const actionCard =
          isTeamCard && event.kind === "casualty" && oppositeTeam && team && ref
            ? deriveActionCard(event, oppositeTeam, oppositeRef, team, ref, t)
            : null;
        // Kickoff wall-clock subs: the `start` row from the kickoff anchor (omitted
        // gracefully when the data is unavailable), the `endMatch` row from its own
        // event timestamp. NOTE (v7): the preview's `ctv-strip` on the start card is
        // intentionally NOT rendered — live events carry no team-value data here.
        const startSub = event.kind === "start" && startedAt != null ? wallClockTime(startedAt) : null;
        const endSub = event.kind === "endMatch" ? wallClockTime(event.at) : null;
        const concedeSub =
          event.kind === "concede" ? concedeLine(event, homeTeam, awayTeam, t) : null;

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
                  {/* Inline meta: turn tag pill (per-side navy/red). */}
                  <span className={`${c.turnTag} ${isAway ? c.turnTagAway : c.turnTagHome}`}>
                    {turnTag(event.half, event.turnNumber)}
                  </span>
                  {/* Inline meta: minute as muted time, right before the body. */}
                  <span className={c.minute}>{minute}</span>
                </>
              ) : null}

              {/* turnStart team card (RAU-36/37): token + team line + the
                  "empieza el turno" sub-line, no dorsal — exactly the validated
                  card. The label is NOT repeated in a right-hand `.detail`
                  (mobile bugfix: "Turno {team}" must render once, in `.name`). */}
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
                    <p className={c.pos}>{t("match.turnStarts")}</p>
                  </div>
                </div>
              ) : event.kind === "journeyman" ? (
                // RAU-13: the journeyman join team card — shirt token + the
                // join line "{name} se une como novato" / "Novato" marker, no
                // dorsal (no single player to name on a multi-novato side).
                <div className={c.cardBody}>
                  <span
                    aria-hidden="true"
                    className={`${c.token} ${isAway ? c.tokenAway : c.tokenHome}`}
                  >
                    <Icon name="shirt" className="h-[18px] w-[18px]" />
                  </span>
                  <div className={c.who}>
                    <p className={c.name}>{label}</p>
                    <p className={c.pos}>{t("match.event.journeyman")}</p>
                  </div>
                  <span className={c.detail}>
                    <span className={`${c.dline} ${isHome ? c.dlineHome : c.dlineAway}`}>
                      <span className={c.dicon}>
                        <Icon name="shirt" className="h-[15px] w-[15px]" />
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
                    {typeof event.payload.outcome === "string" ? (
                      <p className={c.ksub}>
                        {team.name} · {outcomeLabel(event.payload.outcome, t)}
                      </p>
                    ) : null}
                    {treasuryLine(event.payload, t) ? (
                      <p className={c.ktreasury}>{treasuryLine(event.payload, t)}</p>
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
                      {/* RAU-47 BUSINESS RULE: the SPP stars show ONLY on the
                          card of the player who DID the action. A casualty's
                          injury card is the VICTIM's card — it must never show
                          the ★2 the CAUSER earns (the causer's derived action
                          card below carries the star). TD ★3 / completion ★1 /
                          MVP ★4 keep their stars here (the event's player IS
                          the actor). The BB2025 "ambos derribados" (both-down)
                          block result records the ★2 on the causer (DEC-1):
                          non-active coach's record carries `bothDown: true` and
                          the marker copy renders via `bothDownMarkerLabel`. */}
                      {spp > 0 && event.kind !== "casualty" ? (
                        <span className={c.stars}>(★{spp})</span>
                      ) : null}
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
                        {t("match.victimLine", { name: victim.name, dorsal: victim.dorsal })}
                      </span>
                    ) : null}
                    {causeParts && causeParts.cause ? (
                      <p className={c.causeLine}>
                        {causeParts.causer ? (
                          <>
                            {t("match.causeBy")}
                            <b>{causeParts.causer.name}</b>
                            {t("match.causeTail", {
                              dorsal: causeParts.causer.dorsal,
                              cause: causeParts.cause,
                            })}
                          </>
                        ) : (
                          causeParts.cause
                        )}
                        {bothDownMarker ? <span> {bothDownMarker}</span> : null}
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
              {/* Design B: the non-blocking ack row on the event card. */}
              <EventAckRow event={event} viewerSide={viewerSide} now={now} onAck={onAck} />
            </li>
            {/* RAU-39: the DERIVED action card on the CAUSER's side — the same
                casualty event feeds BOTH the injury card (victim, above) and
                this action card (causer + cause + roll/band sub-line). The
                causer is on the OPPOSITE side of the victim (LM-12), so the card
                is a compact full-width row with the rival side's accent + inline
                turn tag/minute meta. */}
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
                      {/* The causer earns the SPP stars for the injury. */}
                      {spp > 0 ? <span className={c.stars}>(★{spp})</span> : null}
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
                <p className={c.ffLine}>{fanTotalsLine(event.payload, t)}</p>
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
