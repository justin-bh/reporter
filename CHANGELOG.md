# Changelog

All notable changes to **reporter** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). Every workspace (server, web,
desktop, terminal recorder, and shared packages) shares one version; bump it
with `pnpm run version:bump <major|minor|patch>`.

## [Unreleased]

### Added

- **Findings: severity, ordering, deletion, and report export.**
  - **CVSS v3.1 severity.** Findings carry a severity on the CVSS v3.1 scale
    (None → Critical). Rate one with the built-in **CVSS v3.1 calculator**
    (eight base metrics → live score, vector, and severity) or pick a severity
    directly from a simple dropdown. The server derives the score and label from
    the vector, so the number can never drift from the vector. A colored
    `SeverityBadge` shows the rating on the list and detail views.
  - **Reorder findings** by drag-and-drop; **reorder the evidence** attached to a
    finding the same way. The manual order drives the list, the PDF, and the JSON
    export. New findings/evidence append to the end.
  - **Delete a finding** from the list row or the detail view (with a confirm
    dialog). Deleting a finding detaches its evidence but never deletes the
    evidence itself.
  - **Export** the findings for an engagement: a one-click **PDF** report
    (rendered server-side with headless Chromium, evidence embedded) and a
    portable **JSON** export. Both default to report-ready findings, with toggles
    to include all findings and to embed evidence content in the JSON.
  - **Import** a findings JSON export into an engagement. Findings are upserted by
    uuid (re-importing the same file is idempotent); embedded evidence is
    recreated with its original uuid, existing evidence is re-linked, and
    reference-only evidence with no local copy is skipped. The import reports how
    many findings/evidence were created, updated, linked, or skipped.
- Desktop **About** view — open it from the tray (_About reporter_) or the window
  nav. It shows the app version, the build's git commit and date, Electron /
  Chromium / Node / V8 versions, the platform, the configured server URL, and a
  **Check for updates** button that compares against the latest GitHub release.
- Build-time version metadata is stamped into the desktop bundle (version, commit,
  build date) so a running app can always report exactly which build it is.
- Repo-wide version tooling: `pnpm run version:bump` keeps every workspace, the
  `reporter-term` CLI banner, and this changelog in lockstep, and can tag the
  release (`--commit`) to trigger the release workflow.

### Changed

- **Renamed the core "Operation" concept to "Engagement"** across the entire
  stack — the term red-teamers use for a scoped piece of work. This is a breaking
  change with no automatic data migration:
  - **Database:** tables `operations` → `engagements`, `user_operation_roles` →
    `user_engagement_roles`, `user_operation_prefs` → `user_engagement_prefs`;
    every `operation_id` column → `engagement_id`; enums `OperationStatus` →
    `EngagementStatus` and `OperationRole` → `EngagementRole`. The `init`
    migration was regenerated with the new names (the `operator`/`operator_id`
    columns are unchanged — an operator is still the person who captures evidence).
  - **Client API & web API:** `/api/operations*` → `/api/engagements*` and
    `/web/operations*` → `/web/engagements*`; the `@reporter/api-client`
    `listOperations()` method → `listEngagements()`.
  - **Web UI:** routes `/operations/:slug/…` → `/engagements/:slug/…`; all
    navigation, headings, and copy now say "Engagement(s)".
  - **Desktop & terminal recorder:** engagement pickers, menus, and the persisted
    current-engagement setting.
  - **Shared:** zod schemas/enums/types renamed to the `Engagement*` forms.
- **Engagement settings → Members** is cleaner: add a member by typing their
  account **email** and picking a role (Read / Write / Admin), instead of hunting
  for their URL "user slug". The member list now shows each person's name and
  email. Server-side, `POST /web/engagements/:slug/users` takes `{ email, role }`
  (validated by the new `addEngagementMemberInput` schema) and resolves the
  account case-insensitively.
- The login rate limit is now tunable via `LOGIN_RATE_LIMIT_MAX` (default `10`
  per minute).

## [0.1.0] - 2026-08-14

### Added

- Initial release: Fastify + PostgreSQL evidence server with web reporting UI,
  the Electron desktop capture app, and the `reporter-term` terminal recorder,
  all sharing `@reporter/shared`, `@reporter/api-client`, and `@reporter/ui`.
