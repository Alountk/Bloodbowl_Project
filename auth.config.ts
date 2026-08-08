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

/**
 * Proxy matcher: gate every route except the Auth.js API, Next.js internals,
 * static assets, and any URL containing a file (e.g. favicon.ico).
 *
 * `/login` and `/signup` are intentionally matched so the gate can redirect
 * authenticated users away from them, per the route-protection spec.
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
