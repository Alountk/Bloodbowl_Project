import { timelinePercent, turnTag } from "@/lib/liveFeed";
import { deriveMinute } from "@/lib/liveFeed";
import { EVENT_GLYPH } from "./liveEventLabels";
import type { LiveMatchView } from "./api";

/**
 * The sticky-header horizontal timeline bar (MVT-2/D4): a full-bleed light
 * track with one icon per display event positioned at
 * `timelinePercent(at, startedAt, end)` — home events on the TOP half, away
 * events on the BOTTOM half, and start/end markers anchored at 0%/100% with
 * 0′/final-minute labels ONLY when the match is finished. The end bound is
 * `finishedAt ?? lastDisplayEventAt` (D4) so a reload produces an identical
 * bar (no live-clock jitter). Only the LM-16 display kinds feed it.
 */

/** The display kinds that render on the bar (MVT-2, LM-16 — kickoff stays out). */
const DISPLAY_KINDS = new Set([
  "start",
  "td",
  "completion",
  "casualty",
  "foul",
  "mvp",
  "endHalf",
  "endMatch",
]);

export function MatchTimelineBar({
  events,
  startedAt,
  finishedAt,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  finishedAt: number | null;
}) {
  const display = events.filter((e) => DISPLAY_KINDS.has(e.kind));
  if (startedAt == null || display.length === 0) return null;

  // D4 reload-identical end bound: finishedAt when finished, else the last
  // display event's timestamp — never the live clock.
  const lastAt = Math.max(...display.map((e) => e.at));
  const end = finishedAt ?? lastAt;
  const finalMinute = deriveMinute(end, startedAt);

  const icons = display.map((e) => {
    const pct = timelinePercent(e.at, startedAt, end);
    const side = e.side === "home" ? "home" : e.side === "away" ? "away" : "mid";
    const glyph =
      e.kind === "casualty"
        ? typeof e.payload.band === "string" && e.payload.band === "bruise"
          ? "🏥"
          : "⚰️"
        : EVENT_GLYPH[e.kind] ?? "•";
    return {
      seq: e.seq,
      pct,
      side,
      glyph,
      title: `${deriveMinute(e.at, startedAt)} · ${turnTag(e.half, e.turnNumber)} · ${glyph}`,
    };
  });

  return (
    <div
      data-testid="match-timeline"
      className="relative mx-0 h-9 w-full overflow-hidden border-t border-[#1f3a7a] bg-[#12225a]"
      role="img"
      aria-label="Cronología del partido"
    >
      {/* Home icons: top half. */}
      <div className="absolute inset-x-0 top-0 h-1/2">
        {icons
          .filter((i) => i.side === "home")
          .map((i) => (
            <span
              key={i.seq}
              data-testid="timeline-icon"
              data-side="home"
              title={i.title}
              aria-hidden="true"
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[11px] leading-none"
              style={{ left: `${i.pct}%` }}
            >
              {i.glyph}
            </span>
          ))}
      </div>
      {/* Away icons: bottom half. */}
      <div className="absolute inset-x-0 bottom-0 h-1/2">
        {icons
          .filter((i) => i.side === "away")
          .map((i) => (
            <span
              key={i.seq}
              data-testid="timeline-icon"
              data-side="away"
              title={i.title}
              aria-hidden="true"
              className="absolute bottom-1/2 translate-y-1/2 -translate-x-1/2 text-[11px] leading-none"
              style={{ left: `${i.pct}%` }}
            >
              {i.glyph}
            </span>
          ))}
      </div>
      {/* Null-side boundary icons (start/endHalf/endMatch): centered vertically. */}
      {icons
        .filter((i) => i.side === "mid")
        .map((i) => (
          <span
            key={i.seq}
            data-testid="timeline-icon"
            data-side="mid"
            title={i.title}
            aria-hidden="true"
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none"
            style={{ left: `${i.pct}%` }}
          >
            {i.glyph}
          </span>
        ))}
      {/* Start/end markers + extreme labels: ONLY when finished (MVT-2/D4). */}
      {finishedAt != null ? (
        <>
          <span
            data-testid="timeline-marker-0"
            className="absolute left-0 top-0 h-1/2 w-px bg-[#9fb3d8]"
            aria-hidden="true"
          />
          <span
            data-testid="timeline-marker-100"
            className="absolute right-0 top-0 h-1/2 w-px bg-[#9fb3d8]"
            aria-hidden="true"
          />
          <span className="absolute left-1 top-full -translate-y-px text-[9px] font-bold text-[#9fb3d8]">
            {"0'"}
          </span>
          <span className="absolute right-1 top-full -translate-y-px text-[9px] font-bold text-[#9fb3d8]">
            {finalMinute}
          </span>
        </>
      ) : null}
    </div>
  );
}
