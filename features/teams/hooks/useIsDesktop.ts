"use client";

import { useEffect, useState } from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

/**
 * SSR-safe viewport gate. Defaults to `true` (desktop) so Server Components and
 * jsdom (which ships no `window.matchMedia`) render the desktop branch without
 * a Flash of Mobile Content. In a browser, subscribes to `matchMedia` so the
 * value tracks whether the `md` breakpoint is active.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const apply = () => setIsDesktop(mql.matches);
    apply();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }

    // Legacy fallback for older engines without the addEventListener API.
    mql.addListener(apply);
    return () => mql.removeListener(apply);
  }, []);

  return isDesktop;
}
