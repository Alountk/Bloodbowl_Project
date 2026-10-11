"use client";

import { createContext, useContext, type ReactNode } from "react";

/** `null` = no provider mounted, so `useUiFlag()` can fall back (mirror of `ThemeContext`). */
const UiFlagContext = createContext<boolean | null>(null);

/**
 * ui-refresh client provider (UIR-1), mirroring `ThemeProvider`. Seeds from
 * the RSC-serialized `initialUiFlag` the root layout resolved from the `bb-ui`
 * cookie, so the server paint and the client agree on first render
 * (anti-FOUC). The flag is read-only: no cookie writer ships in this change.
 */
export function UiFlagProvider({
  children,
  initialUiFlag = false,
}: {
  children: ReactNode;
  /** The flag resolved server-side in the root layout from the `bb-ui` cookie. */
  initialUiFlag?: boolean;
}) {
  return <UiFlagContext.Provider value={initialUiFlag}>{children}</UiFlagContext.Provider>;
}

/**
 * Access the UI flag (ON = V2 surface). Works WITHOUT a mounted provider: it
 * falls back to `false` (legacy) so components render and tests pass with no
 * wrapping context — the `useTheme` fallback semantics (UIR-1).
 */
export function useUiFlag(): boolean {
  const value = useContext(UiFlagContext);
  return value ?? false;
}
