# Changelog

All notable changes to **reporter** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). Every workspace (server, web,
desktop, terminal recorder, and shared packages) shares one version; bump it
with `pnpm run version:bump <major|minor|patch>`.

## [Unreleased]

### Removed

- **Finding "Ticket Link" field.** Removed the finding ticket-link field
  everywhere (schema, API, export/import, and the PDF report). Old export files
  that still carry a `ticketLink` key import cleanly — the key is ignored.

### Added

- **Delete an engagement.** Engagement (and site) admins can now delete an
  engagement from its **Settings → Danger zone**. Deletion is guarded by a
  type-the-slug confirmation and permanently removes the engagement and all of
  its evidence (blobs included), findings, tags, saved queries, and members. New
  admin-only `DELETE /web/engagements/:slug`.
- **Engagements list: card / table views and finding counts.** The engagements
  page now toggles between the existing **card** view and a compact **table**
  view (the choice is remembered per browser). Both views, and the engagement
  header, show a finding count alongside the evidence count — shown only when the
  engagement has at least one finding. The engagement API now returns
  `numFindings`.
- **Engagement-scoped finding categories.** Finding categories can now be listed
  and managed from within an engagement (not just the admin console): any member
  can list them to populate a dropdown, engagement writers can create/revive one,
  and engagement admins can soft-delete one.
- **Evidence comments (linked evidence).** Any piece of evidence can now carry
  **comments** — themselves full evidence (screenshot, note, code block, HTTP
  request, terminal recording, …) linked to a parent piece of evidence, for
  tracking follow-ups/updates and cross-linking related captures. Add one from an
  evidence's detail page (the same Add-evidence form), from `reporter-term` with
  `--comment-on <uuid>`, or from the desktop compose form's **Comment on** picker.
  Comments are real evidence: they appear on the timeline with a link indicator to
  their parent, and a parent shows its comment count. Deleting evidence that has
  comments asks whether to delete them too or keep them as top-level evidence.
- **Findings: Attack Path & captioned evidence.** A finding's evidence is now
  split into two persisted buckets — an ordered, numbered **Attack Path** (each
  step carries an optional caption describing that step of the attack) and plain
  **Attached Evidence**. Attach evidence into either bucket, move links between
  buckets, and reorder within a bucket; positions are tracked per bucket. The
  PDF report renders the Attack Path as numbered steps with captions and lists
  Attached Evidence separately (the Attack Path section is omitted when empty),
  and both the JSON export and import preserve each link's caption and bucket.
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

### Fixed

- **Sign out reliably returns to the login screen.** Signing out could leave the
  user on the app with a "Couldn't load your engagements" error instead of the
  login page, because protected queries refetched (and 401'd) before the auth
  state cleared. Logout now pins the unauthenticated state synchronously so the
  app redirects straight to `/login`, drops all cached data, and can no longer
  reach protected pages — even if the logout request itself fails.
- **Desktop capture now works on modern GNOME/Wayland (and fails loudly, never
  silently).** On Wayland — the default on Ubuntu 24.04+ — capturing an area
  brought up the selection overlay but then produced **no comment window** and
  sometimes an **all-black screenshot**. Root cause: `gnome-screenshot` lost
  access to GNOME Shell's screenshot API in GNOME 49 (Ubuntu 25.10 / 26.04) and no
  longer writes a file on Wayland, and the app treated the missing file as a silent
  "cancelled". Capture now goes through the **XDG desktop portal**
  (`org.freedesktop.portal.Screenshot`, interactive) on Wayland, which shows the
  desktop's native area/window/screen picker, captures real compositor output (no
  more black frames), and returns the cropped image — working across GNOME, KDE,
  and wlroots. It falls back to CLI tools (`gnome-screenshot`, `spectacle`,
  `grim`+`slurp`, `maim`, `scrot`, `import`) on X11 or when no portal is available,
  and now **surfaces a clear error toast** (with the tool's message) instead of
  doing nothing when capture genuinely fails. The reporter window is also hidden
  before capture so it can't occlude the shot or be captured itself. The `.deb`
  now **depends on `xdg-desktop-portal`** (plus `gnome-screenshot` for X11).
- **Global hotkeys under Wayland are now explained.** Electron global shortcuts
  don't fire on Wayland; Settings now says so and points to the tray menu or
  binding a system shortcut to `reporter --capture-area` / `--capture-window`.
- **Desktop app now runs on Linux VMs / headless boxes.** On Linux the Chromium
  GPU process often fails to initialize on machines without a real GPU (`Exiting
  GPU process due to errors during initialization`), which could leave the capture
  window blank. GPU acceleration is now disabled on Linux (the tray + form UI
  doesn't need it); set `REPORTER_ENABLE_GPU=1` to force it back on.
- **Desktop Linux executable is now `reporter`** (was `@reporterdesktop`, derived
  from the scoped package name) — fixes the `reporter` launch command, the `.deb`
  `/usr/bin/reporter` symlink, and the `.desktop` icon lookup.
- **Desktop `.deb` no longer needs a manual `chmod 4755` on Ubuntu 23.10+/24.04+
  /26.04.** A custom `postinst` always makes `chrome-sandbox` SUID root; the stock
  one skipped it because its user-namespace probe runs as root (who can always use
  userns) while the unprivileged user is blocked by AppArmor, so Chromium's
  sandbox aborted at launch. (AppImage can't set SUID; run it with userns enabled
  or `--no-sandbox`.)
- **`reporter-term` no longer crashes with `Error: posix_spawnp failed.` on a
  fresh `npm i -g`.** node-pty starts a session by `posix_spawn`-ing its prebuilt
  `spawn-helper` binary; some installs land that binary without its executable
  bit, so the very first recording aborts before the shell starts. The recorder
  now restores `+x` on `spawn-helper` (macOS/Linux) right before spawning, so
  recording works regardless of how node-pty was unpacked. No-op on Windows
  (ConPTY has no helper). When it *can't* self-heal — e.g. a `sudo npm install`
  left the files owned by root — it no longer dumps a raw stack trace but prints
  an actionable message telling you to `chmod +x` the helper (with `sudo` when
  it's root-owned) or reinstall without sudo.

## [0.1.0] - 2026-08-14

### Added

- Initial release: Fastify + PostgreSQL evidence server with web reporting UI,
  the Electron desktop capture app, and the `reporter-term` terminal recorder,
  all sharing `@reporter/shared`, `@reporter/api-client`, and `@reporter/ui`.
