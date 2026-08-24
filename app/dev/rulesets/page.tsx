import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { APP_DEFAULT_LOCALE, t } from "@/lib/i18n/dictionaries";
import { resolveServerLocale } from "@/lib/i18n/serverLocale";
import { RulesetManager } from "@/features/rulesets/RulesetManager";

/**
 * RAU-52 developer-only "Tipos de reglas" section (Option B: cards + 4-step
 * wizard). Server-gated: no session → 403 panel (in AUTH_MODE=auth the proxy
 * redirects anonymous traffic to /login first); an authenticated user whose DB
 * role is not "developer" gets the same 403 panel. The role is read from the
 * DATABASE (authoritative), so a promoted user gains access immediately.
 *
 * RAU-59: the 403 panel is i18n-aware server-side. It translates with the same
 * locale precedence as the root layout (account → session → cookie), so a
 * non-developer sees the panel in their account language. The user's DB row is
 * already fetched for the role gate, so the account locale comes from there.
 */
export default async function DevRulesetsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true, locale: true } })
    : null;
  const isDeveloper = user?.role === "developer";

  if (!isDeveloper) {
    const cookieStore = await cookies();
    const locale =
      resolveServerLocale({
        cookieLocale: cookieStore.get("bb-locale")?.value,
        sessionLocale: session?.user?.locale ?? null,
        dbLocale: user?.locale ?? null,
      }) ?? APP_DEFAULT_LOCALE;

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

  return <RulesetManager />;
}
