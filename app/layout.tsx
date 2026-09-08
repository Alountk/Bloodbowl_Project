import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SessionProvider } from "@/components/SessionProvider";
import { SessionAppProvider } from "@/app/providers/SessionAppProvider";
import { I18nProvider } from "@/lib/i18n";
import { APP_DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";
import {
  resolveServerLocale,
  localeFromAcceptLanguage,
} from "@/lib/i18n/serverLocale";
import { ThemeProvider } from "@/lib/theme";
import { resolveServerTheme } from "@/lib/theme/serverTheme";

export const metadata: Metadata = {
  title: "Bloodbowl Teams",
  description: "Manage your Blood Bowl teams",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // RAU-58: SSR locale precedence is account (fresh DB read) → session snapshot
  // → `bb-locale` cookie → browser `Accept-Language` → English product default
  // (`APP_DEFAULT_LOCALE`). A signed-in user's account locale wins over the
  // per-browser cookie, so the language follows the account across devices and
  // a /profile change applies on the next request (the JWT snapshot alone would
  // only apply after re-login). Anonymous visitors keep the cookie, then the
  // browser language, and finally default to English. The result is ALWAYS a
  // concrete locale: the server and the client agree on first paint, which
  // kills the hydration mismatch (the client must never re-derive the locale
  // from `navigator.language` on a mounted provider). The DB read is a single
  // PK lookup that only runs when a session exists.
  // The result is ALWAYS a concrete locale: the server and the client agree on
  // first paint, which kills the hydration mismatch (the client must never
  // re-derive the locale from `navigator.language` on a mounted provider). The
  // DB read is a single PK lookup that only runs when a session exists.
  const cookieStore = await cookies();
  const raw = cookieStore.get("bb-locale")?.value;
  const rawTheme = cookieStore.get("bb-theme")?.value;

  const session = await auth();
  let dbLocale: string | null = null;
  let dbTheme: string | null = null;
  if (session?.user?.id) {
    try {
      const row = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locale: true, theme: true },
      });
      dbLocale = row?.locale ?? null;
      dbTheme = row?.theme ?? null;
    } catch {
      // DB unavailable: fall back to the session snapshot / cookie.
      dbLocale = null;
      dbTheme = null;
    }
  }

  const acceptLanguage = (await headers()).get("accept-language");
  const initialLocale =
    resolveServerLocale({
      cookieLocale: raw,
      sessionLocale: session?.user?.locale ?? null,
      dbLocale,
    }) ??
    localeFromAcceptLanguage(acceptLanguage) ??
    APP_DEFAULT_LOCALE;

  // theme-selector (TS-2/TS-4): the SSR theme precedence is account (fresh DB
  // read) → `bb-theme` cookie → `vintage`. Unlike locale there is no JWT
  // snapshot (no client consumer needs it — the DB fresh read covers the
  // account) and no accept-language (both themes are light and `vintage` is the
  // uniform default). The result is ALWAYS a concrete theme painted as
  // `data-theme` on <html> so the first paint is themed (anti-FOUC) and the
  // client ThemeProvider receives the same value as `initialTheme`.
  const initialTheme = resolveServerTheme({ dbTheme, cookieTheme: rawTheme });

  return (
    <html lang={initialLocale} data-theme={initialTheme}>
      <body className="min-h-screen bg-background text-ink antialiased">
        <SessionProvider>
          <I18nProvider initialLocale={initialLocale}>
            <ThemeProvider initialTheme={initialTheme}>
              <SessionAppProvider>{children}</SessionAppProvider>
            </ThemeProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
