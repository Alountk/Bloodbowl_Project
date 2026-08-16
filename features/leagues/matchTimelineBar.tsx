import { timelinePercent, derivePartialScore } from "@/lib/liveFeed";
import { EVENT_GLYPH, liveEventLabel, casualtyIcon } from "./liveEventLabels";
import { Icon, type IconName } from "./icons";
import type { LiveMatchView, MatchTeamDetail } from "./api";

/**
 * The sticky-header horizontal timeline bar (MVT-2/D4, v7): a light full-bleed
 * track with one icon per display event positioned at
 * `timelinePercent(at, startedAt, end)` — home events on the TOP lane, away
 * events on the BOTTOM lane, plus the ALWAYS-rendered mid start/end markers
 * (timer at 0%, flag at 100%) with their `0'` / final-minute labels INSIDE the
 * bar. The end bound is `finishedAt ?? lastDisplayEventAt` (D4) so a reload
 * produces an identical bar (no live-clock jitter). Only the LM-16 display
 * kinds feed it — `endHalf` is deliberately excluded (the preview's timeline
 * only marks start/td/completion/casualty/foul/mvp + the boundary flag).
 */

/** The display kinds that render on the bar (v7 — endHalf stays out). */
const DISPLAY_KINDS = new Set(["td", "completion", "casualty", "foul", "mvp"]);

/** The victim/foul/casualty player name for a tooltip (optional rosters). */
function playerNameOf(
  event: LiveMatchView["events"][number],
  homeTeam?: MatchTeamDetail,
  awayTeam?: MatchTeamDetail,
): string | null {
  if (!event.playerRosterId) return null;
  const team = event.side === "home" ? homeTeam : event.side === "away" ? awayTeam : null;
  const p = team?.players.find((pl) => pl.rosterPlayerId === event.playerRosterId);
  return p?.name ?? null;
}

export function MatchTimelineBar({
  events,
  startedAt,
  finishedAt,
  homeTeam,
  awayTeam,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  finishedAt: number | null;
  homeTeam?: MatchTeamDetail;
  awayTeam?: MatchTeamDetail;
}) {
  const display = events.filter((e) => DISPLAY_KINDS.has(e.kind));
  // The v7 bar renders for every STARTED match — even before the first side
  // event the fixed mid start/end markers + labels are visible (the e2e asserts
  // the bar right after begin). Only a pre-kickoff (no startedAt) or empty
  // feed hides it.
  if (startedAt == null || events.length === 0) return null;

  // D4 reload-identical end bound: finishedAt when finished, else the last
  // display event's timestamp (or the kickoff anchor) — never the live clock.
  const lastAt = display.length > 0 ? Math.max(...display.map((e) => e.at)) : startedAt;
  const end = finishedAt ?? lastAt;
  const finalMinute = Math.max(0, Math.floor((end - startedAt) / 60_000));
  const partialScores = derivePartialScore(events);

  const icons = display.map((e) => {
    const pct = timelinePercent(e.at, startedAt, end);
    const side: "home" | "away" | "mid" =
      e.side === "home" ? "home" : e.side === "away" ? "away" : "mid";
    const name: IconName = e.kind === "casualty" ? casualtyIcon(e.payload) : EVENT_GLYPH[e.kind] ?? "football";
    const minute = Math.max(0, Math.floor((e.at - startedAt) / 60_000));
    const label = liveEventLabel(e);
    const playerName = playerNameOf(e, homeTeam, awayTeam);
    const score =
      e.kind === "td" && e.seq != null && partialScores.has(e.seq)
        ? ` (${partialScores.get(e.seq)!.home} - ${partialScores.get(e.seq)!.away})`
        : "";
    const tip = `${minute}' · ${label}${score}${playerName ? ` · ${playerName}` : ""}`;
    return { seq: e.seq, pct, side, name, tip };
  });

  const lane = (side: "home" | "away" | "mid") =>
    side === "home"
      ? "top-[5px] -translate-x-1/2"
      : side === "away"
        ? "bottom-[5px] -translate-x-1/2"
        : "top-1/2 -translate-x-1/2 -translate-y-1/2";

  const chip = (side: "home" | "away" | "mid") =>
    `flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] bg-white cursor-help ${
      side === "home"
        ? "border-[#12225a] text-[#12225a]"
        : side === "away"
          ? "border-[#d11938] text-[#d11938]"
          : "border-[#94a3b8] text-slate-500"
    }`;

  return (
    <div
      data-testid="match-timeline"
      className="bg-[#f8fafc] pb-1.5"
      role="img"
      aria-label="Línea de tiempo del partido"
    >
      <div className="relative mx-3.5 h-10">
        {/* Track line: 3px gradient centered at 50%. */}
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-[2px] bg-[linear-gradient(90deg,rgba(18,34,90,0.25),rgba(209,25,56,0.25))]"
        />
        {/* Boundary labels INSIDE the bar (top:3px, slate, 700). */}
        <span className="absolute top-[3px] -translate-x-1/2 text-[9px] font-bold tabular-nums text-slate-500" style={{ left: "0%" }}>
          {"0'"}
        </span>
        <span
          className="absolute top-[3px] -translate-x-1/2 text-[9px] font-bold tabular-nums text-slate-500"
          style={{ left: "100%" }}
        >
          {`${finalMinute}'`}
        </span>
        {/* Always-on mid markers: timer at 0%, flag at 100%. */}
        <span
          data-testid="timeline-start-icon"
          data-side="mid"
          data-kind="start"
          title="Inicio del partido"
          className={`absolute ${lane("mid")}`}
          style={{ left: "0%" }}
        >
          <span className={chip("mid")}>
            <Icon name="timer" className="h-3 w-3" />
          </span>
        </span>
        {/* Real display events at their computed percentages. */}
        {icons.map((i) => (
          <span
            key={i.seq}
            data-testid="timeline-icon"
            data-side={i.side}
            data-kind={i.side === "mid" ? "boundary" : undefined}
            title={i.tip}
            aria-hidden="true"
            className={`absolute ${lane(i.side)}`}
            style={{ left: `${i.pct}%` }}
          >
            <span className={chip(i.side)}>
              <Icon name={i.name} className="h-3 w-3" />
            </span>
          </span>
        ))}
        <span
          data-testid="timeline-end-icon"
          data-side="mid"
          data-kind="endMatch"
          title="Fin del partido"
          className={`absolute ${lane("mid")}`}
          style={{ left: "100%" }}
        >
          <span className={chip("mid")}>
            <Icon name="flag" className="h-3 w-3" />
          </span>
        </span>
      </div>
    </div>
  );
}
