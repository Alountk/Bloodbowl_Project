import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/lib/email";

/**
 * Node-runtime Auth.js configuration.
 *
 * The Credentials `authorize` callback requires the database (Prisma) and
 * bcryptjs, both of which run only in the Node runtime. Edge-safe config
 * (`authConfig`) is reused for everything else.
 *
 * `AUTH_SECRET` and `AUTH_TRUST_HOST` are read automatically by Auth.js from
 * the process environment.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

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
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locale: user.locale,
        };
      },
    }),
  ],
});
