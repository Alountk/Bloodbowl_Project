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
    <div className="min-h-screen scroll-smooth bg-background text-slate-900">
      <AppNav showSignIn />

      {/* Flat navy hero: one loud headline, quiet CTA hierarchy, no mock data. */}
      <section aria-label="Hero" className="bg-navy px-6 py-12 text-white sm:py-16">
        <h1 className="font-display text-[34px] font-bold leading-tight sm:text-[44px]">
          {t("landing.heroTitle")}
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-border-subtle sm:text-[16px]">
          {t("landing.heroSubtitle")}
        </p>
        <Link
          href="/signup"
          className="mt-7 inline-block w-full rounded-none bg-red px-5 py-3 text-center text-sm font-extrabold text-white hover:bg-red-hover-bright sm:w-auto"
        >
          {t("landing.ctaSignup")}
        </Link>
        <a
          href="#what-you-get"
          className="mt-3 block w-fit text-sm text-border-subtle underline underline-offset-4 hover:text-white"
        >
          {t("landing.ctaTour")}
        </a>
      </section>

      <main className="mx-auto max-w-[960px] px-5 py-7">
        <section id="what-you-get" aria-labelledby="features-heading" className="scroll-mt-4 pt-6">
          <h2 id="features-heading" className="text-[17px] font-bold text-navy">
            {t("landing.featuresHeading")}
          </h2>
          <p className="mt-1.5 max-w-[600px] text-[13.5px] text-slate">
            {t("landing.featuresSubtitle")}
          </p>
          <ul className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {features.map((feature) => (
              <li
                key={feature.tag}
                className="border-t border-border pt-5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <p className="text-[12px] text-slate">{feature.tag}</p>
                <h3 className="mt-1 text-[15px] font-bold text-navy">{feature.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{feature.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        <HowItWorks />
      </main>

      <footer className="border-t border-slate-200 bg-slate-100 px-4 py-4 text-center text-[12px] text-slate-500">
        {t("landing.footer")}
      </footer>
    </div>
  );
}
