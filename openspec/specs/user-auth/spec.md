# user-auth Specification

## Purpose

Email + password accounts via Auth.js v5 Credentials provider with JWT session strategy. Open registration (signup), login/logout, and route protection: unauthenticated users are redirected to `/login`; all application routes are gated.

## Requirements

### Requirement: Registration

The system MUST provide a signup page at `/signup` allowing open registration with an email and password. The system SHALL hash the password with bcryptjs and store the new User (email unique, passwordHash). A signup with an email already in use MUST fail with a clear error. Signup MUST NOT establish a session: the account starts unverified (`emailVerifiedAt` NULL) and the UI MUST show a check-your-email state that accepts the mailed 6-digit code and offers resending the code (cooldown-limited, reported as a plain retry message — never a raw error body); entering the code verifies the address and only then signs the user in. The mailed activation link (`${APP_URL}/verify?token=…&email=…`) MUST be an equally valid activation path (either the code or the link activates the account). In `AUTH_MODE=local` the flow skips the code screen (no session exists there — the LocalStorage dashboard is the signed-in state).
(Previously: signup established the session in the same step — "the session is established, and the user lands on `/`" — with no verification step; issue #197 PR 2 made signup two-step.)

#### Scenario: Successful signup

- GIVEN a new email and password
- WHEN the user submits the signup form
- THEN a User is created, the check-your-email state shows the address and accepts the 6-digit code, and no session exists until the code is confirmed (local mode skips straight to `/`)
(Previously: THEN a User is created, the session is established, and the user lands on `/`.)

#### Scenario: Duplicate email

- GIVEN an email already registered
- WHEN the user submits signup with that email
- THEN signup fails with "An account with this email already exists" and no user is created

#### Scenario: Resend the verification code

- GIVEN the check-your-email state for a pending address
- WHEN the user asks for a new code
- THEN a fresh code + activation link is mailed to that address, a success confirmation is shown, and a request inside the cooldown reports a retry delay with the server's `retry-after` seconds (the raw `Too many requests` body is never surfaced)

### Requirement: Login and Logout

The system MUST provide a login page at `/login` authenticating email + password against the stored bcryptjs hash. A valid credential MUST issue a JWT session (strategy `jwt`). An account whose email has not been verified MUST NOT receive a session — the refusal is only reachable with the correct password and MUST surface a distinct `email_not_verified` code (a non-enumerating "check your email" message). The client MUST take that refusal to the check-your-email (code + resend) screen rather than a dead-end error, so a stale first code never locks the account out. Logout MUST clear the session and redirect to `/login`.
(Previously: any valid credential issued a session; verification was stored but never enforced — issue #197 PR 2 added the gate.)

#### Scenario: Valid credentials

- GIVEN a registered, verified email and correct password
- WHEN the user submits the login form
- THEN a JWT session is issued and the user is redirected to `/`
(Previously: GIVEN a registered email and correct password — no verification qualifier.)

#### Scenario: Invalid credentials

- GIVEN a registered email and wrong password
- WHEN the user submits the login form
- THEN login fails with "Invalid email or password" and no session is created, regardless of the account's verification state (the state is never revealed without the correct password)

#### Scenario: Unverified account cannot log in

- GIVEN a registered email with correct password but no `emailVerifiedAt` stamp
- WHEN the user submits the login form
- THEN no session is created and the client shows the distinct check-your-email message (Auth.js `code=email_not_verified`)

#### Scenario: Logout

- GIVEN an authenticated session
- WHEN the user clicks logout in the shell
- THEN the session is cleared and the user is redirected to `/login`

### Requirement: Route Protection

The system MUST protect all application routes except `/login`, `/signup`, `/verify`, `/api/auth`, and the public share prefix `/watch` (any `/watch/*` path) using a Next 16 `proxy.ts` (NOT `middleware.ts`) exporting `auth as proxy`. An unauthenticated request MUST be redirected to `/login`; a `loggedInRedirect` MUST prevent authenticated users from visiting `/login` or `/signup`. The `/watch` prefix MUST be public for BOTH anonymous and authenticated users (a logged-in coach MUST still open a share link). The `/verify` activation landing MUST be public for BOTH anonymous and authenticated users (an anonymous click on the mailed link must never bounce to `/login`).
(Previously: only `/login`, `/signup`, and `/api/auth` were public; every other route redirected unauthenticated users to `/login`.)

#### Scenario: Unauthenticated redirect

- GIVEN no session
- WHEN the user requests any protected route
- THEN the response redirects to `/login`

#### Scenario: Authenticated access

- GIVEN a valid session
- WHEN the user requests any protected route
- THEN the route renders normally

#### Scenario: Authenticated blocks auth pages

- GIVEN a valid session
- WHEN the user requests `/login` or `/signup`
- THEN the user is redirected to `/`

#### Scenario: Guest opens a share link

- GIVEN no session
- WHEN the user requests `/watch/[token]`
- THEN the route renders (no redirect to `/login`)

#### Scenario: Authenticated opens a share link

- GIVEN a valid session
- WHEN the user requests `/watch/[token]`
- THEN the route renders (no redirect to `/`)

#### Scenario: Guest opens the activation link

- GIVEN no session
- WHEN the user requests `/verify?token=…&email=…`
- THEN the route renders and activates the account (no redirect to `/login`)

#### Scenario: Authenticated opens the activation link

- GIVEN a valid session
- WHEN the user requests `/verify?token=…&email=…`
- THEN the route renders (no redirect to `/`)

### Requirement: Session Context

The system MUST expose the session to client components via a `SessionProvider` wrapper (Auth.js `useSession`). The shell reads the session status to gate content and show logout.

#### Scenario: Session available to shell

- GIVEN an authenticated session
- WHEN the shell renders via SessionProvider
- THEN the session status is `authenticated` and logout is available
