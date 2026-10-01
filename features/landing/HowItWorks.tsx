"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Collapsible "How it works" section (approved Option B): the three steps stay
 * visible until the coach clicks "Hide"; "Show" brings them back. The collapsed
 * state is NOT persisted — a fresh visit always shows the steps, matching the
 * approved preview and avoiding a localStorage read on first paint. Copy
 * follows the active locale (like the rest of the landing).
 */

export function HowItWorks() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);

  const steps = [
    {
      title: t("landing.howStep1.title"),
      copy: t("landing.howStep1.copy"),
    },
    {
      title: t("landing.howStep2.title"),
      copy: t("landing.howStep2.copy"),
    },
    {
      title: t("landing.howStep3.title"),
      copy: t("landing.howStep3.copy"),
    },
  ] as const;

  return (
    <section aria-labelledby="how-heading" className="mt-12 border-t border-border pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="how-heading" className="mr-auto text-[17px] font-bold text-navy">
          {t("landing.howHeading")}
        </h2>
        <button
          type="button"
          onClick={() => setHidden((value) => !value)}
          aria-expanded={!hidden}
          className="rounded-none border border-navy px-3 py-1.5 text-[13px] font-bold text-navy hover:bg-navy hover:text-white"
        >
          {hidden ? t("landing.howShow") : t("landing.howHide")}
        </button>
      </div>
      <p className="mt-1 text-[13px] text-slate">{t("landing.howSubtitle")}</p>
      {!hidden ? (
        <ol className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="border-t border-border pt-4 first:border-t-0 sm:border-t-0 sm:pt-0"
            >
              <h3 className="text-[15px] font-bold text-navy">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{step.copy}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
