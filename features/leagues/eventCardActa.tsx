import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { deriveMinute, playerRef, derivePartialScore } from "@/lib/liveFeed";
import { ACK_TIMEOUT_MS, isAckableKind } from "@/lib/livePhase";
import {
  causeLabel,
  outcomeLabel,
  formatTreasury,
  liveEventLabel,
  eventCategoryTab,
  eventSpp,
  bandSubLabel,
  casualtyRollLine,
  journeymanJoinLabel,
  bothDownMarkerLabel,
  whoLineLabel,
  type TFunc,
} from "./liveEventLabels";
import type { LiveMatchView, MatchTeamDetail } from "./api";
import { captureAuthorOf } from "./actaTurnSides";
import { KICKOFF_EVENTS } from "@/lib/rules/kickoffEvents";
import { weatherLabel } from "./matchSummary";
import styles from "./eventCardActa.module.css";

/**
 * The v4 "Acta" event card set: a data-sheet style card that lives ALONGSIDE
 * the validated v3 compact rows (`LiveEventCards`). The SHELL is the chosen
 * folder-tab design (`design/acta-folder-tabs/01-folder-tabs.html`, T18):
 * category tab on the top-left, body attached under it, earned SPP only on the
 * inverted bottom-right tab.
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
  text,
  children,
}: {
  label: string;
  num?: boolean;
  /** Wide free-text value (paragraph copy): stacked label over wrapping text. */
  text?: boolean;
  children: ReactNode;
}) {
  const rowClass = text
    ? `${styles.acta__row} ${styles["acta__row--text"]}`
    : styles.acta__row;
  return (
    <div className={rowClass}>
      <dt>{label}</dt>
      <span className={styles.acta__leader} aria-hidden="true" />
      <dd className={num ? styles.acta__num : undefined}>{children}</dd>
    </div>
  );
}

/**
 * The Acta card shell (T18 folder card): category TAB on the top-left (navy;
 * red ONLY for the Casualty category), the body panel attached under it —
 * turn/minute meta, optional serif name + dorsal, optional position line, the
 * S10.4.2 capture-author badge («quién la registró»), the dotted-leader data
 * list, the optional victim-note sub-box (L62) and the optional ack row — and
 * the inverted SPP tab at the bottom-right (only when earned). Data-only cards
 * (no name/position) sit flush under the meta. `tag` is the tab text and never
 * carries SPP (the ★N text rides `spp`).
 */
function ActaCard({
  sideClass,
  tag,
  tabRed,
  meta,
  who,
  name,
  dorsal,
  pos,
  author,
  rows,
  victimNote,
  spp,
  ack,
}: {
  sideClass: string;
  tag: ReactNode;
  /** L60/L63: the ONLY red category tab is the Casualty one. */
  tabRed?: boolean;
  meta: ReactNode;
  /** T19 (artboard 04): the short who-line «Player · Team» above the description. */
  who?: ReactNode;
  name?: ReactNode;
  dorsal?: number;
  pos?: ReactNode;
  author?: ReactNode;
  rows?: ReactNode[];
  /** T18 (L62): «Lo que informa quien la recibe» sub-box (casualty cards). */
  victimNote?: ReactNode;
  /** T18: the inverted bottom-right SPP tab — only when earned (the moved ★N). */
  spp?: ReactNode;
  ack?: ReactNode;
}) {
  const hasHeader = name != null || pos != null;
  // T19: mirrored (away) rows right-align the description/rolls/author text.
  const mirrored = sideClass === styles.away;
  return (
    <article className={`${styles.acta} ${sideClass}`}>
      <div
        data-testid="acta-card-tab"
        className={
          tabRed ? `${styles.acta__tab} ${styles["acta__tab--casualty"]}` : styles.acta__tab
        }
      >
        {tag}
      </div>
      <div className={styles.acta__body}>
        <div className={styles.acta__top}>
          <span className={styles.acta__meta}>{meta}</span>
        </div>
        {who != null ? (
          <p data-testid="acta-card-who" className={styles.acta__who}>
            {who}
          </p>
        ) : null}
        {name != null ? (
          <h3 className={styles.acta__name}>
            {name}
            {dorsal != null ? <span> #{dorsal}</span> : null}
          </h3>
        ) : null}
        {pos != null ? <p className={styles.acta__pos}>{pos}</p> : null}
        {author != null ? (
          <p
            className={`mt-1 text-[10px] font-bold uppercase tracking-wider text-slate${
              mirrored ? " text-right" : ""
            }`}
          >
            {author}
          </p>
        ) : null}
        {rows && rows.length > 0 ? (
          <dl className={`${styles.acta__data} ${hasHeader ? "" : styles["acta__data--flush"]}`}>
            {rows}
          </dl>
        ) : null}
        {victimNote}
        {ack}
      </div>
      {spp != null ? (
        <div data-testid="acta-card-spp" className={styles.acta__spp}>
          {spp}
        </div>
      ) : null}
    </article>
  );
}

/**
 * T18 (L62, artboard .victim-note): the victim-note sub-box «Lo que informa
 * quien la recibe» — the injury roll and its consequences belong to the
 * opponent who receives it («El contrincante pondra que le ha pasado»), with
 * ITS OWN recorder badge (the receiver's coach). Rendered only when there is
 * something reported (roll or consequences) — no invented injury data flows.
 */
function VictimNote({ recorder, rows }: { recorder: ReactNode; rows: ReactNode[] }) {
  return (
    <div data-testid="acta-victim-note" className={styles.victim__note}>
      <p className={styles.victim__head}>Lo que informa quien la recibe</p>
      <dl className={`${styles.acta__data} ${styles["acta__data--flush"]}`}>{rows}</dl>
      {recorder != null ? (
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate">
          {recorder}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The non-blocking acknowledgement row on an event card (Acta `.ack` line).
 * The user's ✓/✗ cotejo is DISABLED: the row renders ONLY the status badge
 * (pending until the timeout, then auto-verified). Only ackable kinds
 * (td/completion/casualty/foul + the LM-13 scored actions) render it; the
 * derived action card never does.
 */
function EventAckRow({
  event,
  now,
}: {
  event: LiveMatchView["events"][number];
  /** Current wall-clock (ms); passed in so auto-verify never calls `Date.now()`. */
  now: number;
}) {
  const { t } = useI18n();
  if (!isAckableKind(event.kind)) return null;
  const ack = event.ackStatus ?? "pending";
  const auto = ack === "pending" && now - event.at > ACK_TIMEOUT_MS;
  const status = auto ? "auto" : ack;

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

  return (
    <div className={styles.ack}>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
        {badgeText}
      </span>
    </div>
  );
}

const PLAYER_EVENT_KINDS = new Set([
  "td",
  "completion",
  "mvp",
  "foul",
  "casualty",
  // LM-13 (Slice E, verifier defect 1): the acta-vocabulary scored actions are
  // player events like a completion — they render the player + dorsal + ★SPP
  // and the ack row (their `isAckableKind` gate already passes).
  "interception",
  "throwTeamMate",
  "landedSafe",
]);

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
  now,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** Current wall-clock (ms) for the non-blocking auto-verify derivation. */
  now: number;
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
        // S10.4.2 (T16): «quién la registró» — the capture author's badge; a
        // side-less system capture has no coach registrar to name.
        const authorSide = captureAuthorOf(event);
        const authorLabel =
          authorSide != null
            ? `Registrado por ${authorSide === "home" ? homeTeam.name : awayTeam.name}`
            : "Registro de sistema";
        // The Acta meta uses the literal "Turno {n}" copy (NOT the global T{n}
        // turn tag): the v4 sheet reads like the rulebook, not the compact feed.
        const turnMeta = `Turno ${event.turnNumber} · ${minute}`;

        // ---- A. player events (td / completion / mvp / foul / casualty + the
        //      LM-13 scored actions: interception / throwTeamMate / landedSafe) ----
        if (PLAYER_EVENT_KINDS.has(event.kind)) {
          const label = liveEventLabel(event, t);
          // T18 (L60/L63): the category tab carries the LABEL only — the
          // earned ★N moved to the bottom-right SPP tab (never «label · ★N» as
          // the title). The casualty INJURY card is the victim's card — it
          // never carries the SPP stars the CAUSER earns (those ride the
          // derived action card) and its tab is the red «Casualty» category.
          const category = eventCategoryTab(event);
          const tag = category?.injury === true ? category.label : label;
          const sppText = event.kind !== "casualty" && spp > 0 ? `★${spp}` : undefined;
          const rows: ReactNode[] = [];
          let victimNote: ReactNode;

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
            // T18 (L62) voice split (artboard .victim-note): the BODY keeps the
            // attacker-side mark («X marca herida a Y» = the Causa row + the
            // both-down marker) with its recorder badge (the T16 capture-author
            // badge stays where it is); the injury roll + consequences move to
            // the victim-note sub-box with the RECEIVER's own recorder badge —
            // `event.side` is the victim's side (LM-12).
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
            const noteRows: ReactNode[] = [];
            // Roll row: reuse `casualtyRollLine` ("Tirada 1D16: 9") and split the
            // label from the number so the number can be bolded.
            const rollLine = casualtyRollLine(event.payload, t);
            const rollMatch = rollLine ? /^(.*?):\s*(\d+)$/.exec(rollLine) : null;
            if (rollMatch) {
              noteRows.push(
                <ActaRow key="roll" label={rollMatch[1]} num>
                  <b>{rollMatch[2]}</b>
                </ActaRow>,
              );
            }
            const bandSub = bandSubLabel(event.payload, t);
            if (bandSub) {
              noteRows.push(
                <ActaRow key="effect" label="Efecto">
                  <b>{bandSub}</b>
                </ActaRow>,
              );
            }
            if (noteRows.length > 0) {
              const receiver = event.side === "home" ? homeTeam.name : awayTeam.name;
              victimNote = (
                <VictimNote
                  recorder={
                    event.side != null ? `Registrado por ${receiver}` : "Registro de sistema"
                  }
                  rows={noteRows}
                />
              );
            }
          }

          const name = player ? player.name : label;
          const dorsal = player?.dorsal;
          const pos = player && team ? `${positionName(team, player.positionalKey)} · ${team.name}` : undefined;
          // T19 (artboard 04): the short who-line speaks for the ROW's own
          // side (the victim on a casualty card — LM-12), fixed, never the
          // viewer's perspective.
          const who = player && team ? whoLineLabel(player.name, team.name) : undefined;

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
                  tabRed={event.kind === "casualty"}
                  meta={turnMeta}
                  who={who}
                  author={authorLabel}
                  name={name}
                  dorsal={dorsal}
                  pos={pos}
                  rows={rows}
                  victimNote={victimNote}
                  spp={sppText}
                  ack={<EventAckRow event={event} now={now} />}
                />
              </li>
              {actionCard ? (
                <li key={`${event.seq}-action`} data-testid="live-event-row">
                  <ActaCard
                    sideClass={event.side === "home" ? styles.away : styles.home}
                    tag={actionCard.label}
                    meta={turnMeta}
                    who={whoLineLabel(actionCard.player.name, oppositeTeam.name)}
                    author={authorLabel}
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
                    spp={spp > 0 ? `★${spp}` : undefined}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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
                author={authorLabel}
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

        // S2 (Cambiar clima): the resulting weather + the recorded d6 (roll
        // row ONLY when one was recorded — the roll stays optional).
        if (event.kind === "weather") {
          const value = typeof event.payload.value === "string" ? event.payload.value : null;
          const roll = typeof event.payload.roll === "number" ? event.payload.roll : null;
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta={turnMeta}
                author={authorLabel}
                rows={[
                  ...(value != null
                    ? [
                        <ActaRow key="result" label="Resultado">
                          <b>{weatherLabel(value, t)}</b>
                        </ActaRow>,
                      ]
                    : []),
                  ...(roll != null
                    ? [
                        <ActaRow key="roll" label="Tirada" num>
                          {`🎲${roll}`}
                        </ActaRow>,
                      ]
                    : []),
                ]}
              />
            </li>
          );
        }

        // DEMO-ONLY (S3 · T4): the production server never emits `kickoff`
        // events — openspec MVT-6 forbids surfacing kickoff-table events in
        // the production feed. This ONE branch exists for the demo harness's
        // sequential kickoff rows (`kind` is an open string on the DTO): the
        // registro note labels the card and the verbatim rulebook effect is
        // kept as an acta row (the defensive fallback below drops rows).
        if (event.kind === "kickoff") {
          const eventId =
            typeof event.payload.eventId === "string"
              ? event.payload.eventId
              : null;
          const face =
            eventId != null
              ? KICKOFF_EVENTS.find((entry) => entry.id === eventId)
              : null;
          return (
            <li key={event.seq} data-testid="live-event-row">
              <ActaCard
                sideClass={styles.neutral}
                tag={liveEventLabel(event, t)}
                meta={turnMeta}
                author={authorLabel}
                rows={
                  face != null
                    ? [
                        <ActaRow key="effect" label="Efecto" text>
                          {face.effect}
                        </ActaRow>,
                      ]
                    : []
                }
              />
            </li>
          );
        }

        // Defensive fallback for an unknown kind: the label + turn/minute meta,
        // never throws.
        return (
          <li key={event.seq} data-testid="live-event-row">
            <ActaCard
              sideClass={sideClass}
              tag={liveEventLabel(event, t)}
              meta={turnMeta}
              author={authorLabel}
            />
          </li>
        );
      })}
    </ol>
  );
}
