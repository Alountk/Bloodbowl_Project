# user-auth Specification

## Purpose

Email + password accounts via Auth.js v5 Credentials provider with JWT session strategy. Open registration (signup), login/logout, and route protection: unauthenticated users are redirected to `/login`; all application routes are gated.

## Requirements

### Requirement: Registration

The system MUST provide a signup page at `/signup` allowing open registration with an email and password. The system SHALL hash the password with bcryptjs and store the new User (email unique, passwordHash). A signup with an email already in use MUST fail with a clear error.

#### Scenario: Successful signup

- GIVEN a new email and password
- WHEN the user submits the signup form
- THEN a User is created, the session is established, and the user lands on `/`

#### Scenario: Duplicate email

- GIVEN an email already registered
- WHEN the user submits signup with that email
- THEN signup fails with "An account with this email already exists" and no user is created

### Requirement: Login and Logout

The system MUST provide a login page at `/login` authenticating email + password against the stored bcryptjs hash. A valid credential MUST issue a JWT session (strategy `jwt`). Logout MUST clear the session and redirect to `/login`.

#### Scenario: Valid credentials

- GIVEN a registered email and correct password
- WHEN the user submits the login form
- THEN a JWT session is issued and the user is redirected to `/`

#### Scenario: Invalid credentials

- GIVEN a registered email and wrong password
- WHEN the user submits the login form
- THEN login fails with "Invalid email or password" and no session is created

#### Scenario: Logout

- GIVEN an authenticated session
- WHEN the user clicks logout in the shell
- THEN the session is cleared and the user is redirected to `/login`

### Requirement: Route Protection

The system MUST protect all application routes except `/login`, `/signup`, and `/api/auth` using a Next 16 `proxy.ts` (NOT `middleware.ts`) exporting `auth as proxy`. An unauthenticated request MUST be redirected to `/login`; a `loggedInRedirect` MUST prevent authenticated users from visiting `/login` or `/signup`.

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

### Requirement: Session Context

The system MUST expose the session to client components via a `SessionProvider` wrapper (Auth.js `useSession`). The shell reads the session status to gate content and show logout.

#### Scenario: Session available to shell

- GIVEN an authenticated session
- WHEN the shell renders via SessionProvider
- THEN the session status is `authenticated` and logout is available
