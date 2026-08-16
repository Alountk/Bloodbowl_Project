/**
 * The deterministic team emblem placeholder (teams have NO emblem field yet).
 * Each team gets a navy-or-red tinted circle whose color is derived from the
 * team id (stable across renders/pages) with the team's INITIAL (uppercase)
 * inside — a future change introduces real emblems. Rulebook-light: the tones
 * are navy/red tints only, no icon library (inline text glyph).
 */

const EMBLEM_TONES = ["#12225a", "#1f3a7a", "#d11938", "#a61b34"] as const;

/** Deterministic tone for a team id: a stable hash picks a navy/red tint. */
export function emblemTone(teamId: string): string {
  let hash = 0;
  for (let i = 0; i < teamId.length; i += 1) {
    hash = (hash * 31 + teamId.charCodeAt(i)) >>> 0;
  }
  return EMBLEM_TONES[hash % EMBLEM_TONES.length];
}

/** The badge initial: the team's first character uppercased ("?" fallback). */
export function teamInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export function TeamEmblem({
  teamId,
  name,
  size = "md",
  className = "",
}: {
  teamId: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeCls =
    size === "xl"
      ? "h-[54px] w-[54px] text-[26px]"
      : size === "lg"
        ? "h-16 w-16 text-3xl"
        : size === "sm"
          ? "h-8 w-8 text-base"
          : "h-10 w-10 text-xl";
  return (
    <span
      data-testid={`emblem-${teamId}`}
      aria-label={`Emblema de ${name}`}
      className={`inline-flex select-none items-center justify-center rounded-full font-black text-white ${sizeCls} ${className}`}
      style={{ backgroundColor: emblemTone(teamId) }}
    >
      {teamInitial(name)}
    </span>
  );
}
