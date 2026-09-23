import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/lib/email";
import { isPasswordAcceptable } from "@/lib/password";

/**
 * A fixed bcrypt hash used to equalize login timing when the email does not
 * resolve. `compare` on a missing user used to return early, which lets an
 * attacker distinguish "unknown email" from "wrong password" by latency. Any
 * valid-looking hash works — this one is for the literal string
 * "dummy-password-for-timing-equalization" at cost 10.
 */
const TIMING_DECOY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/**
 * Node-runtime Auth.js configuration.
 *
 * The Credentials `authorize` callback requires the database (Prisma) and
 * bcryptjs, both of which run only in the Node runtime. Edge-safe config
 * (`authConfig`) is reused for everything else — including the base `jwt`
 * claims mapping. This module layers the Prisma-backed pieces on top:
 * sessionVersion stamping/invalidation for password-rotation logout.
 *
 * `AUTH_SECRET` and `AUTH_TRUST_HOST` are read automatically by Auth.js from
 * the process environment.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Wraps the edge-safe jwt mapping with the DB-backed sessionVersion check.
     *
     * On sign-in (`user` present) the version snapshot rides the token.
     * On every later session read the DB row is re-checked: a password change
     * (or any other sessionVersion bump) makes the snapshots diverge and this
     * returns `null`, which Auth.js treats as "signed out" — a stolen cookie
     * dies the moment the password is rotated. One PK lookup per session
     * request; accepted at this scale.
     */
    async jwt({ token, user, ...rest }) {
      const base = authConfig.callbacks!.jwt!({ token, user, ...rest } as never) as
        | (typeof token & { sv?: number })
        | null;
      if (!base) return base;

      if (user) {
        const sv = (user as { sessionVersion?: unknown }).sessionVersion;
        if (typeof sv === "number") base.sv = sv;
        else base.sv = 0;
        return base;
      }

      const id = typeof base.id === "string" ? base.id : undefined;
      if (!id) return base;

      const row = await prisma.user.findUnique({
        where: { id },
        select: { sessionVersion: true },
      });
      if (!row) return null;
      if ((base.sv ?? 0) !== row.sessionVersion) return null;
      return base;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawEmail = credentials?.email;
        const password = credentials?.password;
        if (typeof rawEmail !== "string" || typeof password !== "string") {
          return null;
        }
        // Emails are stored lowercased (see lib/email normalizeEmail). Normalize
        // here so a mixed-case login matches the stored user.
        const email = normalizeEmail(rawEmail);
        // Bound the bcrypt work: signup/change-password share this rule, and
        // authorize must not become a CPU sink for a multi-MB payload.
        if (!isPasswordAcceptable(password)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          // Equalize the "unknown email" path with a real bcrypt compare so
          // response time does not reveal whether the account exists.
          await compare(password, TIMING_DECOY_HASH);
          return null;
        }

        const passwordMatches = await compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        // `role` rides the JWT so the client nav can gate the dev section. The
        // /api/dev/rulesets routes re-check the role from the DB (authoritative)
        // on every call — the JWT copy is a UI convenience, not the security
        // boundary. Snapshot at sign-in: promoting a user requires re-login for
        // the nav link to appear.
        // `locale` (RAU-58) rides the JWT the same way (snapshot at sign-in);
        // the SSR layout re-reads the DB locale so a change applies on the next
        // request, not only after re-login.
        // `sessionVersion` stamps the JWT so later password changes invalidate
        // this cookie (see the jwt override above).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locale: user.locale,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
