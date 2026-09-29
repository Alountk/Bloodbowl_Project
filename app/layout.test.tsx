import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * theme-selector TS-4 (SSR `data-theme` painting, anti-FOUC).
 *
 * `resolveServerTheme` is covered in isolation by `lib/theme/serverTheme.test.ts`;
 * what those unit tests do NOT prove is the LAYER that reads the request sources
 * (session → fresh DB read, `bb-theme` cookie) and paints the resolved value as
 * `data-theme` on `<html>`. This suite renders the real `RootLayout` with the
 * server boundaries mocked and asserts the painted attribute, mirroring how
 * `lib/i18n/serverLocale.test.ts` pins the locale precedence at the same seam.
 *
 * Cases: `vintage` default (nothing set), `scoreboard` from the cookie, an
 * invalid cookie falling back to `vintage`, and the account theme (fresh DB
 * read) winning over the cookie.
 */

const state = vi.hoisted(() => ({
  cookieTheme: null as string | null,
  cookieLocale: null as string | null,
  sessionUserId: null as string | null,
  dbTheme: null as string | null,
  dbLocale: null as string | null,
  // Whatever the layout handed to the client session provider, captured at the
  // `next-auth/react` seam (the real `@/components/SessionProvider` wrapper runs
  // and forwards straight into this mock).
  providerSession: undefined as unknown,
  providerSessionSet: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = name === "bb-theme" ? state.cookieTheme : name === "bb-locale" ? state.cookieLocale : null;
      return value == null ? undefined : { name, value };
    },
  }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/auth", () => ({
  auth: async () => (state.sessionUserId ? { user: { id: state.sessionUserId } } : null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () =>
        state.sessionUserId ? { locale: state.dbLocale, theme: state.dbTheme } : null,
    },
  },
}));

// The layout mounts client providers; none of them decide the painted theme, so
// they are reduced to pass-throughs / inert hooks. `usePathname` returns "/" so
// `SessionAppProvider` takes its shell-exempt branch and renders children raw.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({
    children,
    session,
  }: {
    children: unknown;
    session?: unknown;
  }) => {
    state.providerSession = session;
    state.providerSessionSet = true;
    return children;
  },
  useSession: () => ({ status: "unauthenticated" }),
  signOut: async () => {},
}));

import RootLayout from "./layout";

async function renderLayoutHtml(): Promise<string> {
  const element = await RootLayout({ children: <div>content</div> });
  return renderToStaticMarkup(element);
}

describe("RootLayout SSR theme painting (TS-4)", () => {
  beforeEach(() => {
    state.cookieTheme = null;
    state.cookieLocale = null;
    state.sessionUserId = null;
    state.dbTheme = null;
    state.dbLocale = null;
    state.providerSession = undefined;
    state.providerSessionSet = false;
  });

  it("paints data-theme=vintage when nothing is set (product default)", async () => {
    const html = await renderLayoutHtml();
    expect(html).toContain('data-theme="vintage"');
  });

  it("paints data-theme=scoreboard from the bb-theme cookie", async () => {
    state.cookieTheme = "scoreboard";
    const html = await renderLayoutHtml();
    expect(html).toContain('data-theme="scoreboard"');
  });

  it("ignores an invalid bb-theme cookie and falls back to vintage", async () => {
    state.cookieTheme = "grimdark";
    const html = await renderLayoutHtml();
    expect(html).toContain('data-theme="vintage"');
  });

  it("prefers the account theme (fresh DB read) over the cookie", async () => {
    state.sessionUserId = "user-1";
    state.dbTheme = "scoreboard";
    state.cookieTheme = "vintage";
    const html = await renderLayoutHtml();
    expect(html).toContain('data-theme="scoreboard"');
  });

  it("falls back to the cookie when the signed-in account has no theme", async () => {
    state.sessionUserId = "user-1";
    state.dbTheme = null;
    state.cookieTheme = "scoreboard";
    const html = await renderLayoutHtml();
    expect(html).toContain('data-theme="scoreboard"');
  });
});

/**
 * SSR shell (P0): `SessionAppProvider` renders its "Loading…" placeholder while
 * `useSession()` reports `loading`, and Auth.js only starts at `loading` when
 * the provider is given NO session. So the whole fix lives in one hand-off —
 * the layout must pass `auth()`'s result through, and it must be an explicit
 * `null` for anonymous visitors, never `undefined`.
 *
 * The two assertions below pin exactly that: an anonymous request that
 * accidentally forwards `undefined` silently reintroduces a "Loading…"
 * first paint for every non-exempt route.
 */
describe("RootLayout session hand-off to the client provider (SSR shell)", () => {
  beforeEach(() => {
    state.cookieTheme = null;
    state.cookieLocale = null;
    state.dbTheme = null;
    state.dbLocale = null;
    state.providerSession = undefined;
    state.providerSessionSet = false;
  });

  it("forwards the server-resolved session so the shell renders on first paint", async () => {
    state.sessionUserId = "user-42";

    await renderLayoutHtml();

    expect(state.providerSessionSet).toBe(true);
    expect(state.providerSession).toEqual({ user: { id: "user-42" } });
  });

  it("forwards an explicit null (not undefined) when there is no session", async () => {
    state.sessionUserId = null;

    await renderLayoutHtml();

    // `undefined` would leave Auth.js at `loading` → "Loading…" SSR.
    expect(state.providerSessionSet).toBe(true);
    expect(state.providerSession).toBeNull();
  });
});
