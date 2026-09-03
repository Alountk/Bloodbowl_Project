/**
 * The deterministic team emblem placeholder (teams have NO emblem field yet).
 * Each team gets a navy-or-red tinted circle whose color is derived from the
 * team id (stable across renders/pages) with the team's INITIAL (uppercase)
 * inside — a future change introduces real emblems. Rulebook-light: the tones
 * are navy/red tints only, no icon library (inline text glyph).
 */

const EMBLEM_TONES = ["#12225a", "#1f3a7a", "#d11938", "#a61b34"] as const;

/** Particles skipped when deriving the match-header acronym (MVT-8/D1). */
const ACRONYM_PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
  "of",
  "the",
]);

/**
 * Pure/deterministic header glyph acronym (MVT-8). Tokens are whitespace-
 * separated runs (hyphenated names count as a single token); particle tokens
 * and digit-leading tokens are skipped; the result is the uppercased first
 * letter of up to 3 significant tokens (or the first letter when one), "?" when
 * none remain.
 */
export function teamAcronym(name: string): string {
  const significant = name
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter(
      (token) => !ACRONYM_PARTICLES.has(token.toLowerCase()) && !/\d/.test(token.charAt(0)),
    );
  if (significant.length === 0) return "?";
  return significant
    .slice(0, 3)
    .map((token) => token.charAt(0).toUpperCase())
    .join("");
}

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
  acronym = false,
  className = "",
}: {
  teamId: string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** MVT-8: match-header glyphs derive from teamAcronym(name) instead of the single initial. */
  acronym?: boolean;
  className?: string;
}) {
  const sizeCls =
    size === "xl"
      ? "h-[54px] w-[54px] text-[26px]"
      : size === "lg"
        ? "h-16 w-16 text-3xl"
        : size === "xs"
          ? "h-[34px] w-[34px] text-[13px]"
          : size === "sm"
            ? "h-8 w-8 text-base"
            : "h-10 w-10 text-xl";
  const glyph = acronym ? teamAcronym(name) : teamInitial(name);
  return (
    <span
      data-testid={`emblem-${teamId}`}
      aria-label={`Emblema de ${name}`}
      className={`inline-flex select-none items-center justify-center rounded-full font-black text-white ${sizeCls} ${className}`}
      style={{ backgroundColor: emblemTone(teamId) }}
    >
      {glyph}
    </span>
  );
}
