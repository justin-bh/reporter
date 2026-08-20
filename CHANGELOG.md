# Changelog

All notable changes to **reporter** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). Every workspace (server, web,
desktop, terminal recorder, and shared packages) shares one version; bump it
with `pnpm run version:bump <major|minor|patch>`.

## [Unreleased]

## [0.5.0] - 2026-08-20

### Added

- **Engagement Goals** — a new **Goals** tab that structures an engagement as a
  **Target → Activity → Goal** tree (systems/devices under scope, their testing
  activities, and the areas-of-interest/objectives under each). Goals carry a
  **status** (Not started / In progress / Complete / N/A) and roll up into a live
  **engagement progress** percentage shown on the Goals tab and the engagements
  list. Each activity gets an auto-created **tag** so evidence captured under it
  correlates back to the goal it advances, and goals can be **linked directly to
  evidence and findings** (with those links surfaced on the evidence and finding
  detail pages). Activities with no imported objectives can have **sub-items
  added** by hand.
- **Import a proposal JSON when creating an engagement** — the "New engagement"
  flow accepts the JSON exported by the proposal-generation tool and builds the
  goals tree from its **scope** section (devices → interfaces → sub-items), a
  1-to-1 translation from proposal to engagement. Sub-items carried over from a
  prior report (e.g. `W1-…`) are auto-flagged as **retests**. Engagement metadata
  (client, assessment type, approach, objectives narrative, scope, contacts,
  start date, exclusions) is applied from the proposal, and the raw JSON is kept
  for provenance.
- **Reports section** — export moves out of Findings into its own **Reports** tab
  where you compose the report: **enable/disable and drag-reorder** every section,
  add **free-text custom sections**, and set options (include-all-findings,
  evidence timeline + grouping). A new **Scope & Objectives Coverage** section can
  render the goals tree (per-target activity/goal coverage with status and linked
  findings/evidence counts). The default configuration reproduces the previous
  report exactly.
- **Report types** — the Reports tab offers one-click **Full report**,
  **Executive summary**, **Findings only**, and **Custom** (your configured
  sections) downloads (PDF / ZIP / JSON).

### Changed

- **Exported report filenames now include the report type and a to-the-second
  timestamp** (e.g. `acme-executive-summary-2026-08-20-143052.pdf`), so different
  report types — and repeated exports on the same day — no longer overwrite each
  other.

### Migration

- Adds the `engagement_targets`, `target_activities`, `activity_goals`,
  `goal_evidence`, and `goal_findings` tables and the `GoalStatus` enum, plus
  `engagements.test_approach`, `objectives_narrative`, `report_config`, and
  `proposal_import`. Purely additive — existing data is untouched and an
  unconfigured engagement's report is byte-for-byte unchanged.

## [0.4.0] - 2026-08-19

### Added

- **Evidence now has a Title** (a short, required label) distinct from its
  **Description** (longer prose). The "Add evidence" modal, the desktop capture
  window, and the `reporter-term` recorder all now ask for both — Title is
  required (`reporter-term` gains a `--title` flag for its `upload` command).
- **Unsaved-changes handling across the app.** Edit-in-place detail pages
  (**evidence**, **finding**, and **engagement settings**) now **autosave** as you
  type — debounced, with a **"Saved"** breadcrumb toast and a live
  *Unsaved / Saving… / Saved* status — and block the save with an inline error
  while a required field (e.g. a blank title) is invalid. The create forms that
  have nothing to autosave yet (**Add evidence**, **Add finding**, and the desktop
  capture window) instead prompt **"Discard changes?"** when you try to leave a
  dirty form, backed by a `beforeunload` guard for tab-close/reload.

### Changed

- Evidence is now shown by its **Title** everywhere it's listed — the timeline,
  finding evidence cards, and the evidence picker — with a **snippet of the
  description** underneath; the full **content** (screenshot, code block, terminal
  recording, HAR, note body) is shown only on the **evidence detail** view. The
  exported PDF report and evidence log likewise key off the title, with the
  description as subtext.
- The findings JSON export is now **schema version 3** (evidence carries its
  `title`). Older v1/v2 exports still import cleanly (title defaults to empty).

### Migration

- Adds `evidence.title`. Existing evidence is migrated by copying its old
  `description` into the new `title`, then clearing `description` — so the former
  single label becomes the title and the description starts empty.

## [0.3.0] - 2026-08-19

### Added

- **Client-ready report, greatly expanded.** The exported PDF now follows a full
  professional pentest-report structure, all reusing the existing house style:
  - **Front matter** gained per-engagement **provider contacts** and **client
    contacts** (name / title / email) on the Engagement Details page.
  - **Executive Summary** gained a structured **Service Scope** (targets →
    subsystems) and **Scope Exclusions**.
  - A new **Assessment Findings** section with a **Summary of Strengths** table, a
    **Summary of Weaknesses** table (now with a **Fix effort** column), a
    **Strategic Recommendations** table, the category breakdown, and a **Standards
    Traceability** matrix. Findings/strengths/recommendations are cross-referenced
    as `W#` / `S#` / `R#`.
  - A new **Threat Model** section (narrative + uploadable diagram images).
  - **Assessment Execution** is now a hand-authored, titled **narrative** (group
    the walkthrough by interface/topic, with evidence embedded per subsection) —
    shown by default; the auto evidence **timeline** is now an optional add-on.
  - Detailed findings gained **Affected target**, **Impact** (distinct from the
    description), **Fix effort**, and **Standards Mapping**.
  - A new **Supporting Information** section: **Client Software Tested**,
    **3rd-Party Software Used**, and an auto-generated **Files Attached** table
    (non-screenshot evidence) with **SHA-256** hashes.
  - Every one of these is editable in **Engagement Settings** (like the executive
    summary), and round-trips through the findings JSON export/import.
- **Findings can be a Strength or a Weakness.** A finding now has a **kind**
  (default *weakness*) selectable when creating a finding and in the finding
  editor. Strengths appear only in the Summary of Strengths table; the server
  clears severity/CVSS/fix-effort/impact/remediation on a strength so it can never
  enter the weaknesses dashboard/tables.
- **Standards mapping (ISO/SAE 21434 & UN R155).** Each finding can be mapped to
  one or more ISO/SAE 21434 work products (including TARA entries) and UN R155
  requirements from a built-in catalog, shown per-finding and in the report's
  traceability matrix.
- **ZIP report bundle.** Alongside the PDF, the Export dialog can produce a **ZIP**
  containing the report plus all supporting files (terminal recordings, HTTP
  cycles, uploaded files — not screenshots, which are embedded) and a
  `SHA256SUMS.txt`. New `GET /web/engagements/:slug/findings/report.zip`.
- **Finding category is now a dropdown** of the engagement's existing categories,
  with inline "add new category" — in the New-finding modal and the finding editor.
- **Evidence records its original filename + content hash.** Uploads now persist
  the original filename (web, client API, desktop, `reporter-term`) and a SHA-256 +
  byte size of the stored blob, used to name and verify files in the report bundle.

### Changed

- **Report export options.** The Export dialog now offers **PDF** or **ZIP
  bundle**, and the Assessment Execution narrative is included by default with the
  evidence timeline as an opt-in toggle. `report.pdf`/`report.zip` accept
  `includeNarrative` and `includeTimeline` query params. The findings export schema
  is now `v2` (older `v1` exports still import).

### Fixed

- **Release binaries now attach to the GitHub Release.** The `Release` workflow
  built the installers but only stored them as ephemeral workflow-run artifacts;
  it now attaches the `.dmg` / `.exe` / `.AppImage` / `.tar.gz` / `.deb` and the
  `reporter-term` `.tgz` to the tag's Release via `softprops/action-gh-release`,
  adds `permissions: contents: write`, and fails loudly (`if-no-files-found:
  error`) if a build produced nothing.
- **Desktop Linux is no longer Ubuntu/Debian-only.** The Linux build now also
  ships a distro-agnostic **`tar.gz`** (extract-and-run, no package manager or
  FUSE required — works on Arch and any distro) alongside the AppImage and `.deb`.
- **`reporter-term` releases install with npm again.** The release now attaches the
  raw `reporter-term-<version>.tgz` (a valid npm gztar) as a Release asset, instead
  of only the double-zipped workflow artifact that `npm install` rejected.

## [0.2.0] - 2026-08-19

### Removed

- **Finding "Ticket Link" field.** Removed the finding ticket-link field
  everywhere (schema, API, export/import, and the PDF report). Old export files
  that still carry a `ticketLink` key import cleanly — the key is ignored.

### Added

- **Block Harbor house-style report PDF.** The exported findings report was
  rebuilt into a client-ready, on-brand document: a dark **cover page** (logo /
  wordmark, assessment type, client, prepared-by, assessment window, status), an
  **Engagement Details** page, a **Table of Contents**, an **Executive Summary
  dashboard** (severity distribution bar + per-severity count cards, a key-stats
  strip, a findings-at-a-glance table, and a category breakdown), a
  **Methodology & Approach** section, **detailed Findings** (severity-ordered,
  each with description, remediation, CVSS, attack path and evidence), an
  **Assessment Execution** evidence timeline (groupable chronologically, by tag,
  or by type), and a **Severity & CVSS Reference** appendix — with a running
  header/footer and "PAGE N OF M" page numbers. The `report.pdf` route accepts
  `evidenceGroup`, `includeTimeline`, and `includeAppendix` query params; the
  Export dialog surfaces the grouping and timeline options.
- **Report metadata on engagements.** Engagements gained optional **Client /
  organization name**, **Assessment type**, **Location**, **Scope**, **Executive
  summary**, and **Methodology** fields, plus per-finding **Remediation** — all
  editable in Engagement Settings / the finding editor and rendered in the
  report. Round-trips through the findings JSON export/import.
- **Per-engagement report watermark.** A configurable watermark is drawn on
  every page of the exported PDF except the cover — defaulting to
  **CONFIDENTIAL**. Engagement Settings lets you set the text, color,
  transparency (light / medium / strong), and placement (under or above the
  content), and toggle it off.
- **Admin → Report branding.** A new Admin tab sets the site-wide report
  organization name, accent color, cover logo (uploaded inline), and footer
  note (defaulting to the Block Harbor house style). New admin-only
  `GET`/`PUT /web/admin/report-settings`.
- **Inline tag creation.** Tags can now be created directly from the tag picker
  while working — in the web evidence editor, the desktop capture composer, and
  the `reporter-term` post-recording prompt — instead of only in Settings. New
  desktop `tags:create` IPC channel.
- **Tag delete warning.** Deleting a tag now reports how many pieces of evidence
  carry it and warns more strongly when it is in use (the tags list response
  includes a `usageCount`).
- **Engagement list: dates & default filter.** The Table view gained sortable
  **Started** and **End** columns (so no dates are lost switching from Cards),
  and the status filter now defaults to **active** so completed/archived
  engagements only appear when explicitly selected.
- **Product mark.** The teal reporter icon is now the web favicon and replaces
  the "reporter" wordmark in the desktop app's navigation.
- **Admin → Engagements console.** A new fourth tab in the Admin area lists
  every engagement on the server — any status, member or not — with member /
  evidence / finding counts and the created date, a name/slug text filter plus a
  status filter, and sortable columns. Each row links to the engagement and to
  its settings (site admins can manage any engagement's settings), can be
  deleted in place after a cascade warning, and engagements the admin isn't a
  member of are marked "not a member". New admin-only
  `GET /web/admin/engagements`.
- **Admin user tools: recovery links, API-key control & TOTP reset.** The
  Admin → Users tab gains per-user actions: **Recovery link** issues the
  (previously API-only) one-time, 24-hour sign-in link and shows it in a modal
  with copy-to-clipboard — and the link now works end to end via the new
  `/login/recovery/:code` page and `POST /web/login/recovery` (single-use,
  redeemed atomically, rate-limited like login). Redeeming a link flags the
  account (`mustResetPassword`) so the user can set a new password once without
  knowing the current one — Account → Security adapts accordingly; **API keys**
  lists a user's client API keys (access key, last used, created — never the
  secret) with per-key revocation; **Reset TOTP** clears a user's enrolled TOTP
  secret (TOTP login enforcement is not yet enabled; only shown for users with
  TOTP enrolled — the admin users list now reports `hasTotp`). New admin-only
  `POST /web/admin/users/:slug/totp-reset` and
  `GET`/`DELETE /web/admin/users/:slug/api-keys[/:accessKey]`.
- **Evidence starring & new timeline filters.** Evidence can now be starred
  per-user (like engagement favorites) straight from the timeline rows — the
  star never navigates, and read-only members can star too. The timeline filter
  bar gains a **Starred only** checkbox and a **Hide comments** checkbox that
  hides evidence linked as comments on other evidence; both surface as removable
  chips, work in saved queries, and round-trip through the Advanced raw-query
  mode via the new `starred` / `no-comments` query keys. The evidence API now
  returns `starred`, and the web API adds
  `POST /web/engagements/:slug/evidence/:uuid/star`.
- **Engagements list: filtering, favorites pinning & sortable table.** The
  engagements page gains a filter bar (free-text match on name/slug plus a
  status filter) that applies to both the card and table views, with a
  clear-filters empty state when nothing matches. Starred engagements are always
  pinned to the top of both views, and the table's Name / Status / Evidence /
  Findings / Members columns are click-to-sort (text columns start ascending,
  numeric columns start with the largest counts). New `SortableTh` primitive in
  `@reporter/ui` for accessible sortable table headers.
- **Engagement lifecycle dates.** Engagements now track a **start date** (set to
  creation time, editable), a user-entered **projected end date**, and an
  **actual end date** the server stamps automatically whenever an engagement moves
  into _Complete_/_Archived_ (and clears on a return to _Active_); all three are
  editable in **Settings → Details**, a projected end can be set when creating an
  engagement, and the dates appear on the engagement header and cards. The desktop
  app and `reporter-term` show each engagement's status in their engagement
  pickers. The engagement API returns `startedAt`, `projectedEndAt`, and
  `actualEndAt`.
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

- **Read-only members see disabled controls instead of 403 errors.** When your
  role on an engagement is read-only, every mutating control on its web pages —
  add/edit/delete evidence, comments, findings (incl. import, attach/detach,
  captions, and drag reordering), saved queries, tags, and categories — now
  renders greyed out with an explanatory tooltip instead of failing with a
  permission error on click; admin-only Settings controls (details, members) do
  the same for non-admin members. Site admins keep full controls on any
  engagement, read-oriented actions (filters, starring, favorites, export
  downloads) stay enabled for everyone, and the server still enforces every
  rule.
- **The Engagements page is membership-scoped for everyone.** Site admins no
  longer see every engagement on the main Engagements page — it now lists only
  the engagements they are a member of, matching its "Engagements you can
  access" subtitle. The new **Admin → Engagements** tab is the all-engagements
  surface. (Server-side, `GET /web/engagements` no longer special-cases
  admins; the client API `GET /api/engagements` still returns everything for
  admins so capture tools keep working.)
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

- **No more sideways scrolling / cut-off content.** Wide evidence (long code
  blocks, HTTP/HAR JSON, long note text) used to stretch the evidence detail page
  past the viewport, pushing the metadata/edit sidebar off-screen and forcing a
  horizontal scroll. Wide content now scrolls inside its own box while the page
  layout stays put; the affected two-column grids and code viewers were fixed and
  the app shell has a horizontal-overflow guard so no view can scroll sideways.
- **Note and event evidence now show their full body.** Creating a note or event
  with body text stored the text but the detail view only showed the short
  description. The detail view now renders the description as a caption above the
  full body; a description-only note shows its text directly.
- **CI and release workflows install pnpm again.** `pnpm/action-setup@v4` began
  failing when both the action's `version` input and package.json's
  `packageManager` field are set (every CI run since Aug 14 died in setup, before
  any code ran). The workflows now omit the redundant `version` input and let the
  action read `packageManager`.
- **`docker compose build` for the server image no longer fails compiling
  `node-pty`.** The desktop app's `dbus-next` dependency pulls in an optional
  `usocket`, which pinned `node-gyp@7.1.2` into the lockfile. That old node-gyp
  got hoisted and used to build `node-pty` (needed only by `reporter-term`)
  during the server image's `pnpm install`, and it can't compile against Node
  22.2x (`gyp ERR! Cannot assign to read only property 'cflags'` — Node 22
  froze `process.config`). Added a pnpm override pinning `node-gyp` to `^11`
  (the current maintained major), which collapses the toolchain to one
  Node-22-capable node-gyp, drops the 7.1.2 subtree from the lockfile, and
  sheds the legacy transitives node-gyp 7/9 dragged in. Node stays at 22 and
  the terminal recorder still builds/loads `node-pty`.
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
