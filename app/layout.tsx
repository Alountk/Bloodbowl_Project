import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { SessionAppProvider } from "@/app/providers/SessionAppProvider";
import { I18nProvider } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = {
  title: "Bloodbowl Teams",
  description: "Manage your Blood Bowl teams",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SSR reads the persisted `bb-locale` cookie so the server and the client
  // agree on the initial locale (kills the hydration language mix).
  const cookieStore = await cookies();
  const raw = cookieStore.get("bb-locale")?.value;
  const initialLocale: Locale | undefined = raw === "es" || raw === "en" ? raw : undefined;

  return (
    <html lang={initialLocale ?? "es"}>
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
