import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { SessionAppProvider } from "@/app/providers/SessionAppProvider";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Bloodbowl Teams",
  description: "Manage your Blood Bowl teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased">
        <SessionProvider>
          <I18nProvider>
            <SessionAppProvider>{children}</SessionAppProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
