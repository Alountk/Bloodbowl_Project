import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RulesetManager } from "@/features/rulesets/RulesetManager";

/**
 * RAU-52 developer-only "Tipos de reglas" section (Option B: cards + 4-step
 * wizard). Server-gated: no session → 403 panel (in AUTH_MODE=auth the proxy
 * redirects anonymous traffic to /login first); an authenticated user whose DB
 * role is not "developer" gets the same 403 panel. The role is read from the
 * DATABASE (authoritative), so a promoted user gains access immediately.
 */
export default async function DevRulesetsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    : null;
  const isDeveloper = user?.role === "developer";

  if (!isDeveloper) {
    return (
      <section className="border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-black tracking-[0.02em] text-[#12225a]">
          Acceso restringido
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta sección es exclusiva para desarrolladores.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Volver al inicio
        </Link>
      </section>
    );
  }

  return <RulesetManager />;
}
