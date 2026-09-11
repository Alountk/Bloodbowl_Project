# Delta for user-auth

## MODIFIED Requirements

### Requirement: Route Protection

The system MUST protect all application routes except `/login`, `/signup`, `/api/auth`, and the public share prefix `/watch` (any `/watch/*` path) using a Next 16 `proxy.ts` (NOT `middleware.ts`) exporting `auth as proxy`. An unauthenticated request MUST be redirected to `/login`; a `loggedInRedirect` MUST prevent authenticated users from visiting `/login` or `/signup`. The `/watch` prefix MUST be public for BOTH anonymous and authenticated users (a logged-in coach MUST still open a share link).
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
