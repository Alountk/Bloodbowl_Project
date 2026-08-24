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

  const session = await auth();
  let dbLocale: string | null = null;
  if (session?.user?.id) {
    try {
      const row = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locale: true },
      });
      dbLocale = row?.locale ?? null;
    } catch {
      // DB unavailable: fall back to the session snapshot / cookie.
      dbLocale = null;
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

  return (
    <html lang={initialLocale}>
      <body className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased">
        <SessionProvider>
          <I18nProvider initialLocale={initialLocale}>
            <SessionAppProvider>{children}</SessionAppProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
