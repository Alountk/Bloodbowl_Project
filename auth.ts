import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/lib/email";
import { isPasswordAcceptable } from "@/lib/password";
import { AUTH_RATE_LIMITS, rateLimit } from "@/lib/rateLimit";

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
 * Thrown when the password was CORRECT but `emailVerifiedAt` is still NULL
 * (issue #197 PR 2: signup no longer signs the user in).
 *
 * Subclassing `CredentialsSignin` with a custom `code` is what lets Auth.js
 * surface a distinguishable signal: the core error handler serializes
 * `error.code` into the sign-in redirect URL
 * (`/login?error=CredentialsSignin&code=email_not_verified`) and the client
 * `signIn(..., { redirect: false })` parses both values back out of
 * `data.url`. A plain `null` return can only ever produce the default
 * `code=credentials`. The message never reaches the client — only type+code do.
 */
class EmailNotVerifiedSignin extends CredentialsSignin {
  constructor() {
    super();
    this.code = "email_not_verified";
  }
}

/**
 * The Credentials `authorize` callback, extracted verbatim so the core
 * invariant below has direct unit coverage (`auth.test.ts`): a regression
 * that moved the `emailVerifiedAt` check BEFORE the bcrypt compare would
 * silently reintroduce the account-enumeration oracle this file documents.
 * Wiring is unchanged — `Credentials({ … authorize: authorizeCredentials })`.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
) {
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

  // Brute-force control: reject BEFORE the DB lookup/bcrypt so a flood
  // of wrong passwords never pays hashing cost. Auth.js maps `null` to
  // the generic credentials error (no oracle for "rate limited" vs
  // "wrong password").
  const gate = rateLimit(
    `login:${email}`,
    AUTH_RATE_LIMITS.login.limit,
    AUTH_RATE_LIMITS.login.windowMs,
  );
  if (!gate.ok) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Equalize the "unknown email" path with a real bcrypt compare so
    // response time does not reveal whether the account exists.
    await compare(password, TIMING_DECOY_HASH);
    return null;
  }

  const passwordMatches = await compare(password, user.passwordHash);
  if (!passwordMatches) return null;

  // Two-step signup (issue #197 PR 2): an unverified account cannot log
  // in. ORDER MATTERS — the check runs only AFTER the bcrypt compare:
  // before it, a caller with a wrong password would learn the account
  // exists and is unverified (an oracle signup's rate-limited 409 does
  // not give); after it, the branch costs one property read on top of
  // the successful path, so it cannot time-distinguish "unverified" from
  // "wrong password", and "unknown email" still pays the decoy compare
  // above. `emailVerifiedAt` rides the SAME `findUnique` (no `select`,
  // so every column is already loaded) — no second query.
  if (user.emailVerifiedAt === null) throw new EmailNotVerifiedSignin();

  // `role` rides the JWT so the client nav can gate the dev section. The
  // /api/dev/rulesets routes re-check the role from the DB (authoritative)
  // on every call — the JWT copy is a UI convenience, not the security
  // boundary. Snapshot at sign-in: promoting a user requires re-login for
  // the nav link to appear.
  // `locale` (RAU-58) rides the JWT the same way (snapshot at sign-in);
  // the SSR layout re-reads the DB locale so a change applies on the next
  // request, not only after re-login.
  // `sessionVersion` stamps the JWT so later password changes invalidate
  // this cookie (see the jwt override in the config below).
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    sessionVersion: user.sessionVersion,
  };
}

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
      authorize: authorizeCredentials,
    }),
  ],
});
