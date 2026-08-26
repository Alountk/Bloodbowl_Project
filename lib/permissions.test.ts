import { describe, expect, it } from "vitest";
import {
  can,
  canAny,
  isPlan,
  isRole,
  planAtLeast,
  PLANS,
  ROLES,
} from "./permissions";

describe("roles (RBAC) — RAU-52", () => {
  it("guards the union values", () => {
    expect(isRole("user")).toBe(true);
    expect(isRole("developer")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("maps role → permissions", () => {
    expect(can("user", "rulesets.dev")).toBe(false);
    expect(can("user", "users.manage")).toBe(false);
    expect(can("developer", "rulesets.dev")).toBe(true);
    expect(can("developer", "users.manage")).toBe(true);
    expect(can("admin", "users.manage")).toBe(true);
    expect(can(null, "rulesets.dev")).toBe(false);
    expect(can("mystery", "rulesets.dev")).toBe(false);
  });

  it("canAny returns true when any permission is granted", () => {
    expect(canAny("user", ["rulesets.dev", "users.manage"])).toBe(false);
    expect(canAny("developer", ["rulesets.dev", "users.manage"])).toBe(true);
    expect(canAny("developer", ["users.manage"])).toBe(true);
  });
});

describe("plans (billing tiers) — RAU-52", () => {
  it("guards the union values", () => {
    expect(isPlan("free")).toBe(true);
    expect(isPlan("club")).toBe(true);
    expect(isPlan("premium")).toBe(true);
    expect(isPlan("vip")).toBe(false);
  });

  it("planAtLeast follows the tier order (free < club < premium)", () => {
    expect(planAtLeast("free", "free")).toBe(true);
    expect(planAtLeast("club", "free")).toBe(true);
    expect(planAtLeast("premium", "free")).toBe(true);
    expect(planAtLeast("premium", "club")).toBe(true);
    expect(planAtLeast("club", "premium")).toBe(false);
    expect(planAtLeast("free", "club")).toBe(false);
    expect(planAtLeast(null, "free")).toBe(false);
    expect(planAtLeast("vip", "free")).toBe(false);
  });

  it("exposes the ordered union for UI selects", () => {
    expect(ROLES).toEqual(["user", "developer", "admin"]);
    expect(PLANS).toEqual(["free", "club", "premium"]);
  });
});
