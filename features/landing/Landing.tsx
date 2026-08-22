import Link from "next/link";
import { HowItWorks } from "./HowItWorks";

/**
 * Public landing page (approved Option B). Rendered by the home route for
 * anonymous users in auth mode; logged-in users get the Dashboard instead.
 *
 * Copy is English (home-chrome convention) and static — no i18n keys, matching
 * the approved preview. Buttons are square (border-radius 0, no shadow) per the
 * design reference.
 */

const FEATURES = [
  {
    tag: "Rosters",
    title: "Draft your team",
    copy: "31 races with rulebook costs, skills and characteristics.",
  },
  {
    tag: "Season",
    title: "Automatic fixtures",
    copy: "Round-robin matchdays and negotiation when schedules clash.",
  },
  {
    tag: "Live",
    title: "Shared match board",
    copy: "Turn clock, events and rolls stream to both coaches.",
  },
  {
    tag: "Growth",
    title: "SPP & injuries",
    copy: "Progress players, miss the next match, hire journeymen.",
  },
] as const;

export function Landing() {
  return (
    <div className="min-h-screen scroll-smooth bg-[#f8fafc] text-slate-900">
      {/* Public nav: logo + section links + Sign in (the landing has no app shell). */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[#12225a] px-5 py-3 text-white">
        <span className="text-[18px] font-black tracking-[0.02em]">🏈 Blood Bowl Teams</span>
        <nav aria-label="Landing" className="ml-auto hidden items-center gap-1 sm:flex">
          <Link
            href="/leagues"
            className="rounded-none px-2 py-1 text-[13px] text-[#cbd5e1] hover:bg-white/10 hover:text-white"
          >
            Matches
          </Link>
          <Link
            href="/teams"
            className="rounded-none px-2 py-1 text-[13px] text-[#cbd5e1] hover:bg-white/10 hover:text-white"
          >
            Teams
          </Link>
          <Link
            href="/leagues"
            className="rounded-none px-2 py-1 text-[13px] text-[#cbd5e1] hover:bg-white/10 hover:text-white"
          >
            Leagues
          </Link>
        </nav>
        <Link
          href="/login"
          className="ml-auto rounded-none px-3 py-1.5 text-[13px] font-bold text-[#cbd5e1] hover:bg-white/10 hover:text-white sm:ml-0"
        >
          Sign in
        </Link>
      </header>

      {/* Navy compact hero + CTA + art panel mock. */}
      <section
        aria-label="Hero"
        className="flex flex-wrap items-center gap-7 px-6 py-10 text-white"
        style={{
          background: "linear-gradient(135deg,#0f1d4d 0%,#12225a 60%,#1e3a8a 100%)",
        }}
      >
        <div className="min-w-[280px] flex-1">
          <h1 className="text-[30px] font-black leading-tight">Your league, in your pocket.</h1>
          <p className="mt-2.5 max-w-[480px] text-[14px] text-[#cbd5e1]">
            From roster drafts to the final whistle — teams, matchdays and live
            matches for your Blood Bowl group.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-none bg-[#d11938] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#e51b40]"
            >
              Sign up free
            </Link>
            <a
              href="#what-you-get"
              className="rounded-none border-2 border-white/70 px-5 py-2.5 text-sm font-extrabold text-white hover:border-white hover:bg-white/10"
            >
              Tour the app
            </a>
          </div>
        </div>
        <div className="min-w-[270px] flex-1 rounded-xl border border-white/20 bg-white/5 p-4 text-[12px]">
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Liga Novatos Test</span>
            <span>Jornada 1 · 2 teams</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Rookies Test A</span>
            <span>11 / 11 players</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-[7px]">
            <span>Rookies Test B</span>
            <span>11 / 11 players</span>
          </div>
          <div className="flex justify-between py-[7px]">
            <span className="text-[#fde68a]">● Live now</span>
            <span>0 – 0</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[960px] px-5 py-7">
        <section id="what-you-get" aria-labelledby="features-heading" className="scroll-mt-4">
          <h2 id="features-heading" className="text-[17px] font-black text-[#12225a]">
            What you get
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Everything a commissioner needs — and nothing you don&apos;t.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
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
        Blood Bowl is a Games Workshop game. This is a fan tool, not affiliated with GW.
      </footer>
    </div>
  );
}
