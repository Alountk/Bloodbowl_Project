/**
 * RAU-52 account model: roles (RBAC) + billing plans, as typed, extensible
 * unions. Pure module — no auth/DB — so the capability map is trivially
 * unit-testable. The server guards read the role from the DATABASE
 * (authoritative); the JWT carries it only as a login-time snapshot.
 *
 * Two orthogonal concepts:
 * - `role` — what you CAN do (authorization): user · developer · admin.
 * - `plan` — what you PAY (billing tier): free · club · premium. No payment
 *   logic exists yet; the field + checks are ready for future feature flags.
 */

export const ROLES = ["user", "developer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ["free", "club", "premium"] as const;
export type Plan = (typeof PLANS)[number];

/** Billing tiers are ordered: a higher tier implies every lower one. */
export const PLAN_ORDER: readonly Plan[] = ["free", "club", "premium"];

/** The application's capability surface (permission keys). */
export const PERMISSIONS = ["rulesets.dev", "users.manage"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** role → permissions. Extend here when a new capability appears. */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: [],
  developer: ["rulesets.dev", "users.manage"],
  // Future platform management (users, plans, billing) — inherits the dev set.
  admin: ["rulesets.dev", "users.manage"],
};

/** Narrower type guard: any value is a valid role only when in ROLES. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Narrower type guard: any value is a valid plan only when in PLANS. */
export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

/** Whether a role may perform a permission (unknown roles never can). */
export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role as Role]?.includes(permission) ?? false;
}

/** Whether a role may perform ANY of the given permissions (nav-link helper). */
export function canAny(
  role: string | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(role, permission));
}

/** Whether a plan is at least `min` in the tier order (future feature flags). */
export function planAtLeast(plan: string | null | undefined, min: Plan): boolean {
  if (!plan) return false;
  const index = PLAN_ORDER.indexOf(plan as Plan);
  const minIndex = PLAN_ORDER.indexOf(min);
  if (index === -1 || minIndex === -1) return false;
  return index >= minIndex;
}
