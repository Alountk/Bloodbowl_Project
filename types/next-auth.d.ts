import { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * RAU-52: the JWT/session carry `role` ("developer" unlocks the /dev/rulesets
   * section in the nav). Snapshot at sign-in; the /api/dev/rulesets routes
   * always re-check the DB role (authoritative), so this is UI-only.
   */
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
}
