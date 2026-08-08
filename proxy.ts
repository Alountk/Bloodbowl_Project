export { auth as proxy } from "./auth";

// Proxy matcher (Next 16 convention). Gate every route except the Auth.js API,
// Next.js internals, static assets, and any URL containing a file extension
// (e.g. favicon.ico). `/login` and `/signup` are intentionally matched so the
// `authorized` callback can redirect authenticated users away from them.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
