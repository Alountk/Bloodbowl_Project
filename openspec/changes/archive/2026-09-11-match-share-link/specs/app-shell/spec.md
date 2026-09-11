# Delta for app-shell

## ADDED Requirements

### Requirement: AS-9 · Public Watch Shell Exemption

`SessionAppProvider` MUST exempt the public watch route from the shared `AppShell` (sidebar/nav chrome) exactly as it exempts `/`: when `pathname` starts with `/watch`, it MUST render children directly (inside the root layout providers) without mounting `AppShell`. Every other route MUST keep rendering inside `AppShell`.

#### Scenario: Guest watch page has no chrome

- GIVEN a request for `/watch/[token]`
- WHEN `SessionAppProvider` renders
- THEN no `AppShell` (Sidebar/Topbar) mounts and children render directly

#### Scenario: Other routes keep the shell

- GIVEN any non-`/watch` route
- WHEN `SessionAppProvider` renders
- THEN `AppShell` mounts unchanged
