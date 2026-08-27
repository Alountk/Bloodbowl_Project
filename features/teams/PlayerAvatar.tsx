"use client";

import type { CSSProperties } from "react";
import { SPRITE_SCALE, spritePath, spriteScaleClass } from "./sprites";

export interface PlayerAvatarProps {
  raceId: string;
  positionalKey: string;
  /** Emoji shown while the team has no approved sprite (or a 404 fallback). */
  fallbackIcon: string;
  /** Base cell size in px before the size-class scale is applied. */
  size?: number;
  className?: string;
}

/**
 * Renders the approved AI sprite for a player, scaled by size class
 * (big 130% / normal 100% / small 70%), or the emoji fallback when the
 * team's sprites have not shipped yet.
 */
export function PlayerAvatar({
  raceId,
  positionalKey,
  fallbackIcon,
  size = 28,
  className,
}: PlayerAvatarProps) {
  const path = spritePath(raceId, positionalKey);
  if (!path) {
    return <span className={className}>{fallbackIcon}</span>;
  }
  const scale = SPRITE_SCALE[spriteScaleClass(raceId, positionalKey)];
  const dim = Math.round(size * scale);
  const style: CSSProperties = { width: dim, height: dim };
  return (
    <span className={className} style={style}>
      {/* Sprites are tiny pre-optimized PNGs (≤6KB); next/image optimization is unnecessary. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={path}
        alt=""
        width={dim}
        height={dim}
        draggable={false}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
