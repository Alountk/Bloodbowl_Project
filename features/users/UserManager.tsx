"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { PLANS, ROLES } from "@/lib/permissions";
import { listDevUsers, patchDevUser, type DevUser } from "./api";

/**
 * RAU-52 developer user manager: lists every account and lets a user with the
 * `users.manage` permission change roles and plans. The current user's OWN
 * role select is disabled (the server rejects self-role changes to prevent a
 * dev-section lockout); their plan stays editable. Errors surface inline.
 */
export function UserManager() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentUserId = session?.user?.id;

  const refresh = useCallback(async () => {
    try {
      setUsers(await listDevUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dev.users.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    listDevUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("dev.users.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const applyPatch = async (user: DevUser, data: Partial<Pick<DevUser, "role" | "plan">>) => {
    setSavingId(user.id);
    setSaveError(null);
    try {
      const updated = await patchDevUser(user.id, data);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("dev.users.saveError"));
      await refresh();
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <p className="bg-white p-8 text-center text-sm text-slate-500" role="status">
        {t("dev.users.loading")}
      </p>
    );
  }

  if (error) {
    return <p className="bg-white p-8 text-center text-sm text-red-600">{error}</p>;
  }

  return (
    <section aria-labelledby="dev-users-heading" className="space-y-4">
      <h1
        id="dev-users-heading"
        className="border-b-[3px] border-[#d11938] pb-1.5 text-[22px] font-black text-[#12225a]"
      >
        {t("dev.users.heading")}
      </h1>

      {saveError ? (
        <p role="alert" className="text-sm text-red-600">
          {saveError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-[#e2e8f0] bg-white">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-3 py-2 font-bold">{t("dev.users.account")}</th>
              <th scope="col" className="px-3 py-2 font-bold">{t("dev.users.role")}</th>
              <th scope="col" className="px-3 py-2 font-bold">{t("dev.users.plan")}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                  {t("dev.users.empty")}
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className="border-b border-[#f1f5f9] last:border-b-0">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{user.name ?? "—"}</p>
                      <p className="text-[11px] text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={t("dev.users.roleFor", { account: user.email })}
                        value={user.role}
                        disabled={isSelf || savingId === user.id}
                        onChange={(event) => applyPatch(user, { role: event.target.value })}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {isSelf ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {t("dev.users.selfRoleHint")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={t("dev.users.planFor", { account: user.email })}
                        value={user.plan}
                        disabled={savingId === user.id}
                        onChange={(event) => applyPatch(user, { plan: event.target.value })}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {PLANS.map((plan) => (
                          <option key={plan} value={plan}>
                            {plan}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
