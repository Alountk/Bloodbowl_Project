import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { isAuthEnabled, resolveAuthGate } from "@/lib/auth-mode";

/**
 * Edge-safe Auth.js configuration.
 *
 * This module must only import code that runs on the Edge runtime: no Prisma,
 * no bcryptjs (Node-only). The Credentials `authorize` (which needs the database)
 * is injected in `auth.ts` which runs in the Node runtime.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Credentials `authorize` is added in auth.ts (Node runtime).
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const action = resolveAuthGate({
        auth,
        pathname: request.nextUrl.pathname,
        authEnabled: isAuthEnabled(),
      });

      if (action === "redirect-login") {
        return NextResponse.redirect(new URL("/login", request.nextUrl));
      }
      if (action === "redirect-home") {
        return NextResponse.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
