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
    <section
      aria-labelledby="how-heading"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 px-4 py-3.5">
        <h2 id="how-heading" className="flex-1 text-[16px] font-black text-[#12225a]">
          {t("landing.howHeading")}
        </h2>
        <span className="hidden text-[11.5px] text-slate-500 sm:inline">
          {t("landing.howSubtitle")}
        </span>
        <button
          type="button"
          onClick={() => setHidden((value) => !value)}
          aria-expanded={!hidden}
          className="rounded-none border-2 border-[#12225a] bg-white px-3.5 py-1.5 text-[13px] font-bold text-[#12225a] hover:bg-[#eef2ff]"
        >
          {hidden ? t("landing.howShow") : t("landing.howHide")}
        </button>
      </div>
      {!hidden ? (
        <div className="grid gap-3.5 p-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="relative rounded-xl border border-slate-200 bg-white p-4 pt-6"
            >
              <span className="absolute -top-3 left-4 grid h-7 w-7 place-items-center rounded-full bg-[#d11938] text-[13px] font-black text-white">
                {index + 1}
              </span>
              <h3 className="text-[15px] font-bold text-[#12225a]">{step.title}</h3>
              <p className="mt-1 text-[12.5px] text-slate-500">{step.copy}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
