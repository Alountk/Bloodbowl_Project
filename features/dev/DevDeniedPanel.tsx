import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/dictionaries";

interface DevDeniedPanelProps {
  /** The resolved locale for the panel (account → session → cookie → default),
   * computed server-side by the calling dev page. */
  locale: Locale;
}

/**
 * Shared 403 panel for the dev sections (RAU-52, RAU-59): i18n-aware
 * server-side, translating with the same locale precedence as the root layout.
 * The calling page resolves the locale (it already fetched the user row for
 * the permission gate) and passes it down, keeping this component sync.
 */
export default function DevDeniedPanel({ locale }: DevDeniedPanelProps) {
  return (
    <section className="border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-2xl font-black tracking-[0.02em] text-[#12225a]">
        {t(locale, "dev.deniedTitle")}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{t(locale, "dev.deniedBody")}</p>
      <Link
        href="/"
        className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
      >
        {t(locale, "dev.backHome")}
      </Link>
    </section>
  );
}
