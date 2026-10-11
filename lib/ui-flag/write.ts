import { UI_FLAG_COOKIE } from "./flag";

/**
 * Client writer for the ui-refresh flag (UIR-6, issue #331), the mirror of
 * `writeThemeCookie` (lib/theme/index.tsx): same `path=/`, `max-age=31536000`
 * and `SameSite=Lax` attributes. `writeUiFlag(true)` sets `bb-ui=next`;
 * `writeUiFlag(false)` expires the cookie (max-age=0) so the flag resolves OFF
 * again — the theme writer never needed the expire branch because themes always
 * carry a value. Cookie access can throw in restricted contexts (or with no
 * document at all, e.g. SSR): the writer never throws.
 *
 * A client write only takes effect after re-SSR — callers pair it with
 * `router.refresh()` to re-seed the server `UiFlagProvider`.
 */
export function writeUiFlag(next: boolean): void {
  try {
    document.cookie = next
      ? `${UI_FLAG_COOKIE}=next; path=/; max-age=31536000; SameSite=Lax`
      : `${UI_FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Cookie access can throw in restricted contexts: ignore it.
  }
}
