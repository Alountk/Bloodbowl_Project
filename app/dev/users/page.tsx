import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { APP_DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";
import { resolveServerLocale } from "@/lib/i18n/serverLocale";
import { can } from "@/lib/permissions";
import DevDeniedPanel from "@/features/dev/DevDeniedPanel";
import { UserManager } from "@/features/users/UserManager";

/**
 * RAU-52 developer "Usuarios" section: manage account roles and plans
 * (RBAC + billing tiers). Server-gated by the `users.manage` permission
 * (developers today; admins inherit it later) — DB-authoritative. The 403
 * panel follows the account → session → cookie locale precedence.
 */
export default async function DevUsersPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true, locale: true } })
    : null;

  if (!can(user?.role, "users.manage")) {
    const cookieStore = await cookies();
    const locale =
      resolveServerLocale({
        cookieLocale: cookieStore.get("bb-locale")?.value,
        sessionLocale: session?.user?.locale ?? null,
        dbLocale: user?.locale ?? null,
      }) ?? APP_DEFAULT_LOCALE;
    return <DevDeniedPanel locale={locale} />;
  }

  return <UserManager />;
}
