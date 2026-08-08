import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { SessionAppProvider } from "@/app/providers/SessionAppProvider";

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
    <html lang="en">
      <body className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased">
        <SessionProvider>
          <SessionAppProvider>{children}</SessionAppProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
