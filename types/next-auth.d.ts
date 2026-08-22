import { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * RAU-52: the JWT/session carry `role` ("developer" unlocks the /dev/rulesets
   * section in the nav). Snapshot at sign-in; the /api/dev/rulesets routes
   * always re-check the DB role (authoritative), so this is UI-only.
   * RAU-58: `locale` (es|en) is the account's UI language, snapshot at sign-in
   * like role. The SSR layout re-reads the DB locale (fresher), so a change
   * applies on the next request; this copy is for client-side convenience.
   */
  interface Session {
    user: {
      id: string;
      role?: string;
      locale?: string;
    } & DefaultSession["user"];
  }
}
