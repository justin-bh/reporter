# Changelog

All notable changes to **reporter** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). Every workspace (server, web,
desktop, terminal recorder, and shared packages) shares one version; bump it
with `pnpm run version:bump <major|minor|patch>`.

## [Unreleased]

### Added
- Desktop **About** view — open it from the tray (*About reporter*) or the window
  nav. It shows the app version, the build's git commit and date, Electron /
  Chromium / Node / V8 versions, the platform, the configured server URL, and a
  **Check for updates** button that compares against the latest GitHub release.
- Build-time version metadata is stamped into the desktop bundle (version, commit,
  build date) so a running app can always report exactly which build it is.
- Repo-wide version tooling: `pnpm run version:bump` keeps every workspace, the
  `reporter-term` CLI banner, and this changelog in lockstep, and can tag the
  release (`--commit`) to trigger the release workflow.

## [0.1.0] - 2026-08-14

### Added
- Initial release: Fastify + PostgreSQL evidence server with web reporting UI,
  the Electron desktop capture app, and the `reporter-term` terminal recorder,
  all sharing `@reporter/shared`, `@reporter/api-client`, and `@reporter/ui`.
