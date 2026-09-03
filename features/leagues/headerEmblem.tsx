/**
 * MVT-8/MVT-9 match-header emblem: header-only acronym glyph (HeaderEmblem)
 * within a keyboard-reachable `role="img"` host that exposes exactly one
 * screen-reader name ("Emblema de {name}") while the full team name lives in a
 * desktop-only (pointer:fine + hover) tooltip. The tooltip never enters the
 * a11y tree (aria-hidden) — MVT-3 the header shows no full-name *text*, so the
 * name is conveyed via aria on the host and the pure-CSS tooltip only.
 */

import { TeamEmblem } from "./TeamEmblem";

export function HeaderEmblem({
  teamId,
  name,
  side,
}: {
  teamId: string;
  name: string;
  /** Static edge anchor: home column `left-0`, away column `right-0` (D4). */
  side: "home" | "away";
}) {
  // Tooltip is desktop-only: revealed on hover (fine pointer) AND on keyboard
  // focus of the reachable host, never on touch/coarse devices (media gate).
  return (
    <span
      role="img"
      tabIndex={0}
      aria-label={`Emblema de ${name}`}
      className="group relative inline-flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#cbd5e1]"
    >
      <TeamEmblem teamId={teamId} name={name} acronym size="xs" />
      <span
        aria-hidden="true"
        className={`pointer-events-none invisible z-30 absolute bottom-[calc(100%+8px)] w-max max-w-[190px] rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold leading-snug text-white shadow-lg ${side === "away" ? "right-0" : "left-0"} [@media(hover:hover)_and_(pointer:fine)]:group-hover:visible [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:visible`}
      >
        {name}
      </span>
    </span>
  );
}
