/**
 * Full-document navigation, for the few places where a client-side transition
 * is NOT enough.
 *
 * The logout flows are the case: after `signOut()` clears the session, a
 * `router.push("/")` is answered from the client Router Cache — the payload
 * that was rendered while the user was still signed in. The result is the
 * dashboard sitting on screen with the nav already showing no user, and the
 * server never gets asked again. A full document load re-requests the route
 * with the cleared cookie, so the server re-decides Landing vs Dashboard.
 *
 * It also sidesteps Auth.js `redirectTo`, which builds the redirect from the
 * server's own host (`HOSTNAME=0.0.0.0` in the container produced
 * `0.0.0.0:3444/login`); `window.location` uses the browser's origin.
 *
 * Kept as its own module so call sites read as intent and tests can assert the
 * navigation without fighting jsdom's read-only `location`.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
