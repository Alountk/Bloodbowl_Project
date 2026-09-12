import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { deriveMinute, playerRef, derivePartialScore } from "@/lib/liveFeed";
import { ACK_TIMEOUT_MS, eventAuthorSide, isAckableKind } from "@/lib/livePhase";
import {
  causeLabel,
  outcomeLabel,
  formatTreasury,
  liveEventLabel,
  eventSpp,
  bandSubLabel,
  casualtyRollLine,
  journeymanJoinLabel,
  bothDownMarkerLabel,
  type TFunc,
} from "./liveEventLabels";
import type { LiveMatchView, MatchTeamDetail } from "./api";
import styles from "./eventCardActa.module.css";

/**
 * The v4 "Acta" event card set: a data-sheet style card that lives ALONGSIDE
 * the validated v3 compact rows (`LiveEventCards`). Source of truth for the
 * visual design: `previews/event-card-acta.html`.
 *
 * The event DERIVATION is copied verbatim from v3 (`liveEventCards.tsx`): the
 * local helpers `sideLookup`, `findPlayer`, `positionName`, `foulVictim`,
 * `casualtyCauseParts`, `deriveActionCard`, `treasuryLine`, `fanTotalsLine`,
 * `wallClockTime` and `turnReasonTag`, plus the per-event derivation inside the
 * `ordered.map(...)`. Only the RENDERED JSX changes — each event (and the
 * derived causer action card) becomes an `.acta` sheet instead of the v3 row.
 *
 * Newest first (seq desc), `turn` rows skipped, ack rows only on the ackable
 * player cards. Important values render in `<b>` per the Acta bold convention.
 */

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
 * "por {name} (#{dorsal}) · {cause}" (name/cause bolded at the render site); a
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
 * with the cause label. Self-inflicted casualties (dodge/crowd) carry no causer
 * → null; an unresolvable causer also returns null (never throws).
 */
function deriveActionCard(
  event: LiveMatchView["events"][number],
  causerTeam: MatchTeamDetail,
  causerRef: Map<string, number>,
  victimTeam: MatchTeamDetail,
  victimRef: Map<string, number>,
  fn: TFunc,
): { player: Exclude<RosterLookup, undefined>; label: string } | null {
  const causerId = event.payload.causerRosterId;
  if (typeof causerId !== "string") return null;
  const player = findPlayer(causerTeam, causerId, causerRef);
  if (!player) return null;
  const cause = typeof event.payload.cause === "string" ? event.payload.cause : "";
  return { player, label: causeLabel(cause, fn) };
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
  const beforeText = new Intl.NumberFormat("es-ES").format(before);
  return `${beforeText} → ${formatTreasury(after, fn)}`;
}

/**
 * The per-team fan-factor parts for the two Acta rows (LM-24): each side reads
 * `👥{base} + 🎲{dice} = {total}` with the total bolded at the render site. A
 * missing/malformed side falls back to `?` markers so the rows always render
 * and never throw.
 */
function fanSideParts(side: unknown): { base: string; dice: string; total: string } {
  if (typeof side !== "object" || side === null) return { base: "?", dice: "?", total: "?" };
  const o = side as Record<string, unknown>;
  return {
    base: typeof o.base === "number" ? String(o.base) : "?",
    dice: typeof o.dice === "number" ? String(o.dice) : "?",
    total: typeof o.total === "number" ? String(o.total) : "?",
  };
}

/** The wall-clock HH:MM sub-line for the start / endMatch rows (v7). */
function wallClockTime(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/**
 * LM-28: the visible reason tag on a LIVE turnStart card. Returns null when the
 * payload has no legal reason (a TD-auto-flip/kickoff turn renders no tag).
 */
function turnReasonTag(
  reason: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (reason === "voluntary") return t("match.turnReason.voluntary");
  if (reason === "turnover") return t("match.turnReason.turnover");
  if (reason === "injury") return t("match.turnReason.injury");
  return null;
}

/**
 * One dotted-leader data row inside `.acta__data`. `num` opts the value into
 * tabular figures; `children` carries the value (important parts in `<b>`).
 */
function ActaRow({
  label,
  num,
  children,
}: {
  label: string;
  num?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.acta__row}>
      <dt>{label}</dt>
      <span className={styles.acta__leader} aria-hidden="true" />
      <dd className={num ? styles.acta__num : undefined}>{children}</dd>
    </div>
  );
}

/**
 * The Acta card shell: header (tag/meta), optional serif name + dorsal,
 * optional position line, optional dotted-leader data list and optional ack
 * row. Data-only cards (no name/position) sit flush under the header.
 */
function ActaCard({
  sideClass,
  tag,
  meta,
  name,
  dorsal,
  pos,
  rows,
  ack,
}: {
  sideClass: string;
  tag: ReactNode;
  meta: ReactNode;
  name?: ReactNode;
  dorsal?: number;
  pos?: ReactNode;
  rows?: ReactNode[];
  ack?: ReactNode;
}) {
  const hasHeader = name != null || pos != null;
  return (
    <article className={`${styles.acta} ${sideClass}`}>
      <div className={styles.acta__top}>
        <span className={styles.acta__tag}>{tag}</span>
        <span className={styles.acta__meta}>{meta}</span>
      </div>
      {name != null ? (
        <h3 className={styles.acta__name}>
          {name}
          {dorsal != null ? <span> #{dorsal}</span> : null}
        </h3>
      ) : null}
      {pos != null ? <p className={styles.acta__pos}>{pos}</p> : null}
      {rows && rows.length > 0 ? (
        <dl className={`${styles.acta__data} ${hasHeader ? "" : styles["acta__data--flush"]}`}>
          {rows}
        </dl>
      ) : null}
      {ack}
    </article>
  );
}

/**
 * Design B (RAU-82): the non-blocking acknowledgement row on an event card,
 * copied from v3 and restyled to the Acta `.ack` line (label + ✓/✗ buttons via
 * the shared ack tokens). Only ackable kinds (td/completion/casualty/foul) ever
 * render it; the derived action card never does.
 */
function EventAckRow({
  event,
  viewerSide,
  now,
  onAck,
}: {
  event: LiveMatchView["events"][number];
  viewerSide: "home" | "away" | null;
  /** Current wall-clock (ms); passed in so auto-verify never calls `Date.now()`. */
  now: number;
  onAck: (eventSeq: number, status: "ok" | "nok") => void;
}) {
  const { t } = useI18n();
  if (!isAckableKind(event.kind)) return null;
  const payloadCauser = typeof event.payload.causerRosterId === "string" ? event.payload.causerRosterId : null;
  const author = eventAuthorSide(event.kind, event.side, payloadCauser);
  const ack = event.ackStatus ?? "pending";
  const auto = ack === "pending" && now - event.at > ACK_TIMEOUT_MS;
  const status = auto ? "auto" : ack;
  const isRival = author !== null && viewerSide !== null && viewerSide !== author;

  const badgeClass =
    status === "ok" || status === "auto"
      ? "border-ack-ok-border bg-ack-ok-fill text-ack-ok-text"
      : status === "nok"
        ? "border-ack-review-border bg-ack-review-fill text-ack-review-text"
        : "border-border bg-fill-hover text-slate";
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
      <div className={styles.ack}>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.ack}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate">
        {t("match.ack.pending")}
      </span>
      <button
        type="button"
        onClick={() => onAck(event.seq, "ok")}
        className="rounded border border-ack-ok-border bg-panel px-2 py-0.5 text-[10px] font-bold text-ack-ok-text hover:bg-ack-ok-fill"
      >
        {t("match.ack.okAction")}
      </button>
      <button
        type="button"
        onClick={() => onAck(event.seq, "nok")}
        className="rounded border border-ack-review-border bg-panel px-2 py-0.5 text-[10px] font-bold text-ack-review-text hover:bg-ack-review-fill"
      >
        {t("match.ack.nokAction")}
      </button>
    </div>
  );
}

const PLAYER_EVENT_KINDS = new Set(["td", "completion", "mvp", "foul", "casualty"]);

/**
 * The v4 Acta event feed: newest first (seq desc), `turn` skipped. Player
 * events render a sheet (with the derived causer action sheet on a casualty);
 * team events (turnStart/journeyman/expensive_mistake) and system events
 * (start/endHalf/endMatch/concede/fan_factor) render team- or neutral-sided
 * sheets.
 */
export function LiveEventCardsActa({
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
      className="flex flex-col gap-2.5 bg-background"
    >
      {ordered.map((event) => {
        // RAU-36/37: the generic "Fin de turno" row is noise — the turn change
        // is conveyed by the team-assigned turnStart card of the side taking over.
        if (event.kind === "turn") return null;

        const isHome = event.side === "home";
        const isAway = event.side === "away";
        const team = isAway ? awayTeam : isHome ? homeTeam : null;
        const ref = isAway ? awayRef : isHome ? homeRef : null;
        const oppositeTeam = isAway ? homeTeam : awayTeam;
        const oppositeRef = isAway ? homeRef : awayRef;
        const player = team && event.playerRosterId && ref ? findPlayer(team, event.playerRosterId, ref) : undefined;
        const minute = deriveMinute(event.at, startedAt ?? 0);
        const spp = eventSpp(event);
        const sideClass = isAway ? styles.away : isHome ? styles.home : styles.neutral;
        // The Acta meta uses the literal "Turno {n}" copy (NOT the global T{n}
        // turn tag): the v4 sheet reads like the rulebook, not the compact feed.
        const turnMeta = `Turno ${event.turnNumber} · ${minute}`;

        // ---- A. player events (td / completion / mvp / foul / casualty) ----
        if (PLAYER_EVENT_KINDS.has(event.kind)) {
          const label = liveEventLabel(event, t);
          // The casualty INJURY card is the victim's card — it never carries the
          // SPP stars the CAUSER earns (those ride the derived action card).
          const tag = event.kind !== "casualty" && spp > 0 ? `${label} · ★${spp}` : label;
          const rows: ReactNode[] = [];

          if (event.kind === "td" && partialScores.has(event.seq)) {
            const partial = partialScores.get(event.seq)!;
            rows.push(
              <ActaRow key="score" label="Marcador" num>
                <b>{`${partial.home} - ${partial.away}`}</b>
              </ActaRow>,
            );
          }

          if (event.kind === "foul" && team) {
            const victim = foulVictim(event.payload, oppositeTeam, oppositeRef);
            if (victim) {
              rows.push(
                <ActaRow key="victim" label="Víctima">
                  {"a "}
                  <b>{victim.name}</b>
                  {` (#${victim.dorsal})`}
                </ActaRow>,
              );
            }
          }

          if (event.kind === "casualty") {
            const bandSub = bandSubLabel(event.payload, t);
            if (bandSub) {
              rows.push(
                <ActaRow key="effect" label="Efecto">
                  <b>{bandSub}</b>
                </ActaRow>,
              );
            }
            // Roll row: reuse `casualtyRollLine` ("Tirada 1D16: 9") and split the
            // label from the number so the number can be bolded.
            const rollLine = casualtyRollLine(event.payload, t);
            const rollMatch = rollLine ? /^(.*?):\s*(\d+)$/.exec(rollLine) : null;
            if (rollMatch) {
              rows.push(
                <ActaRow key="roll" label={rollMatch[1]} num>
                  <b>{rollMatch[2]}</b>
                </ActaRow>,
              );
            }
            const causeParts = team ? casualtyCauseParts(event.payload, oppositeTeam, oppositeRef, t) : null;
            const bothDownMarker = bothDownMarkerLabel(event.payload, t);
            if (causeParts && causeParts.cause) {
              rows.push(
                <ActaRow key="cause" label="Causa">
                  {causeParts.causer ? (
                    <>
                      {t("match.causeBy")}
                      <b>{causeParts.causer.name}</b>
                      {t("match.causeTail", { dorsal: causeParts.causer.dorsal, cause: "" })}
                      <b>{causeParts.cause}</b>
                    </>
                  ) : (
                    <b>{causeParts.cause}</b>
                  )}
                  {bothDownMarker ? <span> {bothDownMarker}</span> : null}
                </ActaRow>,
              );
            }
          }

          const name = player ? player.name : label;
          const dorsal = player?.dorsal;
          const pos = player && team ? `${positionName(team, player.positionalKey)} · ${team.name}` : undefined;

          // RAU-39: the derived action sheet on the CAUSER's side (the causer is
          // an OPPONENT of the victim per LM-12), no ack row.
          const actionCard =
            event.kind === "casualty" && oppositeTeam && team && ref
              ? deriveActionCard(event, oppositeTeam, oppositeRef, team, ref, t)
              : null;
          const actionVictim =
            actionCard && team && ref && typeof event.payload.victimRosterId === "string"
              ? findPlayer(team, event.payload.victimRosterId, ref)
              : undefined;

          return (
            <Fragment key={event.seq}>
              <li data-testid="live-event-row">
                <ActaCard
                  sideClass={sideClass}
                  tag={tag}
                  meta={turnMeta}
                  name={name}
                  dorsal={dorsal}
                  pos={pos}
                  rows={rows}
                  ack={<EventAckRow event={event} viewerSide={viewerSide} now={now} onAck={onAck} />}
                />
              </li>
              {actionCard ? (
                <li key={`${event.seq}-action`} data-testid="live-event-row">
                  <ActaCard
                    sideClass={event.side === "home" ? styles.away : styles.home}
                    tag={spp > 0 ? `${actionCard.label} · ★${spp}` : actionCard.label}
                    meta={turnMeta}
                    name={actionCard.player.name}
                    dorsal={actionCard.player.dorsal}
                    pos={`${positionName(oppositeTeam, actionCard.player.positionalKey)} · ${oppositeTeam.name}`}
                    rows={
                      actionVictim
                        ? [
                            <ActaRow key="action" label="Acción">
                              {"Herida a "}
                              <b>{actionVictim.name}</b>
                            </ActaRow>,
                          ]
                        : []
                    }
                  />
                </li>
              ) : null}
            </Fragment>
          );
        }

        // ---- C. team events (turnStart / journeyman / expensive_mistake) ----
        if (event.kind === "turnStart" && team) {
          const reason = turnReasonTag(event.payload.reason, t);
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={sideClass}
                tag="Inicio de turno"
                meta={turnMeta}
                name={team.name}
                pos={t("match.turnStarts")}
                rows={
                  reason
                    ? [
                        <ActaRow key="reason" label="Motivo">
                          <b>{reason}</b>
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        if (event.kind === "journeyman" && team) {
          const joinLine = journeymanJoinLabel(event.payload, t);
          let name: string = t("match.event.journeyman");
          let pos: string | undefined;
          if (joinLine) {
            const names = Array.isArray(event.payload.names) ? event.payload.names : [];
            const suffixKey = names.length === 1 ? "match.event.journeymanJoin" : "match.event.journeymanJoinMany";
            const suffix = t(suffixKey, { name: "" });
            if (suffix && joinLine.endsWith(suffix)) {
              name = joinLine.slice(0, joinLine.length - suffix.length);
              const rawPos = suffix.trim();
              pos = rawPos.charAt(0).toUpperCase() + rawPos.slice(1);
            } else {
              name = joinLine;
            }
          }
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={sideClass}
                tag={t("match.event.journeyman")}
                meta={turnMeta}
                name={name}
                pos={pos}
              />
            </li>
          );
        }

        if (event.kind === "expensive_mistake" && team) {
          const treasury = treasuryLine(event.payload, t);
          const outcome = typeof event.payload.outcome === "string" ? outcomeLabel(event.payload.outcome, t) : undefined;
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={sideClass}
                tag={liveEventLabel(event, t)}
                meta="Kickoff"
                name={team.name}
                pos={outcome}
                rows={
                  treasury
                    ? [
                        <ActaRow key="treasury" label="Tesorería" num>
                          <b>{treasury}</b>
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        // ---- D. system / centered (neutral, no team) ----
        if (event.kind === "start") {
          const time = startedAt != null ? wallClockTime(startedAt) : null;
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta="Kickoff"
                rows={
                  time
                    ? [
                        <ActaRow key="time" label="Hora" num>
                          <b>{time}</b>
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        if (event.kind === "endHalf") {
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta={`Mitad ${event.half}`}
                rows={[
                  <ActaRow key="minute" label="Minuto" num>
                    <b>{minute}</b>
                  </ActaRow>,
                ]}
              />
            </li>
          );
        }

        if (event.kind === "endMatch") {
          const time = wallClockTime(event.at);
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta="Final"
                rows={
                  time
                    ? [
                        <ActaRow key="time" label="Hora" num>
                          <b>{time}</b>
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        if (event.kind === "concede") {
          const surrenderTeam = event.side === "away" ? awayTeam : event.side === "home" ? homeTeam : null;
          const winnerSide = event.payload.winnerSide;
          const winnerTeam = winnerSide === "away" ? awayTeam : winnerSide === "home" ? homeTeam : null;
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta={turnMeta}
                name={surrenderTeam?.name}
                pos={surrenderTeam ? "Se rinde" : undefined}
                rows={
                  winnerTeam
                    ? [
                        <ActaRow key="winner" label="Victoria">
                          <b>{winnerTeam.name}</b>
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        if (event.kind === "fan_factor") {
          const home = fanSideParts(event.payload.home);
          const away = fanSideParts(event.payload.away);
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta="Kickoff"
                rows={[
                  <ActaRow key="home" label="Local" num>
                    {`👥${home.base} + 🎲${home.dice} = `}
                    <b>{home.total}</b>
                  </ActaRow>,
                  <ActaRow key="away" label="Visitante" num>
                    {`👥${away.base} + 🎲${away.dice} = `}
                    <b>{away.total}</b>
                  </ActaRow>,
                ]}
              />
            </li>
          );
        }

        // Defensive fallback for an unknown kind: the label + turn/minute meta,
        // never throws.
        return (
          <li key={event.seq} data-testid="live-event-row">
            <ActaCard sideClass={sideClass} tag={liveEventLabel(event, t)} meta={turnMeta} />
          </li>
        );
      })}
    </ol>
  );
}
