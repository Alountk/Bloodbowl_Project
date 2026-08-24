"use client";

import Link from "next/link";
import { HowItWorks } from "./HowItWorks";
import { AppNav } from "@/components/AppNav";
import { useI18n } from "@/lib/i18n";

/**
 * Public landing page (approved Option B). Rendered by the home route for
 * anonymous users in auth mode; logged-in users get the Dashboard instead.
 *
 * Copy follows the ACTIVE locale (the nav already did; the hero used to be
 * hardcoded English). Anonymous visitors default to English; Spanish browsers
 * or a `bb-locale=es` cookie get the Spanish hero. Buttons are square
 * (border-radius 0, no shadow) per the design reference. The header is the
 * unified `AppNav` (public variant: the "Sign in" button opens the auth modal,
 * not a /login navigation).
 */

export function Landing() {
  const { t } = useI18n();

  const features = [
    {
      tag: t("landing.feature.rosters.tag"),
      title: t("landing.feature.rosters.title"),
      copy: t("landing.feature.rosters.copy"),
    },
    {
      tag: t("landing.feature.season.tag"),
      title: t("landing.feature.season.title"),
      copy: t("landing.feature.season.copy"),
    },
    {
      tag: t("landing.feature.live.tag"),
      title: t("landing.feature.live.title"),
      copy: t("landing.feature.live.copy"),
    },
    {
      tag: t("landing.feature.growth.tag"),
      title: t("landing.feature.growth.title"),
      copy: t("landing.feature.growth.copy"),
    },
  ] as const;

  return (
    <div className="min-h-screen scroll-smooth bg-[#f8fafc] text-slate-900">
      <AppNav showSignIn />

      {/* Navy compact hero + CTA + art panel mock. */}
      <section
        aria-label="Hero"
        className="flex flex-wrap items-center gap-7 px-6 py-10 text-white"
        style={{
          background: "linear-gradient(135deg,#0f1d4d 0%,#12225a 60%,#1e3a8a 100%)",
        }}
      >
        <div className="min-w-[280px] flex-1">
          <h1 className="text-[30px] font-black leading-tight">{t("landing.heroTitle")}</h1>
          <p className="mt-2.5 max-w-[480px] text-[14px] text-[#cbd5e1]">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-none bg-[#d11938] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#e51b40]"
            >
              {t("landing.ctaSignup")}
            </Link>
            <a
              href="#what-you-get"
              className="rounded-none border-2 border-white/70 px-5 py-2.5 text-sm font-extrabold text-white hover:border-white hover:bg-white/10"
            >
              {t("landing.ctaTour")}
            </a>
          </div>
        </div>
        <div className="min-w-[270px] flex-1 rounded-xl border border-white/20 bg-white/5 p-4 text-[12px]">
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Liga Novatos Test</span>
            <span>{t("landing.mockMatchday")}</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Rookies Test A</span>
            <span>{t("landing.mockPlayers")}</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Rookies Test B</span>
            <span>{t("landing.mockPlayers")}</span>
          </div>
          <div className="flex justify-between py-[7px]">
            <span className="text-[#fde68a]">● {t("landing.mockLive")}</span>
            <span>0 – 0</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[960px] px-5 py-7">
        <section id="what-you-get" aria-labelledby="features-heading" className="scroll-mt-4">
          <h2 id="features-heading" className="text-[17px] font-black text-[#12225a]">
            {t("landing.featuresHeading")}
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {t("landing.featuresSubtitle")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.tag}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#d11938]">
                  {feature.tag}
                </p>
                <h3 className="mt-1.5 text-[14px] font-bold text-[#12225a]">{feature.title}</h3>
                <p className="mt-1 text-[12px] text-slate-500">{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <HowItWorks />
      </main>

      <footer className="border-t border-slate-200 bg-slate-100 px-4 py-4 text-center text-[12px] text-slate-500">
        {t("landing.footer")}
      </footer>
    </div>
  );
}
