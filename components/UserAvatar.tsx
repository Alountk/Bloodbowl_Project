/**
 * Shared avatar image, used by both the profile page and the match-card owner
 * rows. Renders an `<img>` only when an adapter-issued avatar value is present;
 * renders nothing at all when it is absent so callers keep their existing name
 * fallbacks (MatchCard owner side without an avatar).
 */
export function UserAvatar({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Avatar del entrenador" className="h-8 w-8 rounded-full object-cover" />
  ) : null;
}
