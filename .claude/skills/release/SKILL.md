---
name: release
description: Build all reporter deliverables — the packages, the server Docker image, the Electron desktop installers, and the reporter-term npm tarball — and list the produced artifacts. Use to cut a release build or verify everything packages cleanly.
---

# release

Produce every shippable reporter artifact and report where each landed.

## Steps

0. **Set the release version (all workspaces share one number):**

   ```bash
   pnpm run version:bump <major|minor|patch>   # or an explicit X.Y.Z
   ```

   This rewrites every workspace `package.json`, the `reporter-term` `.version()` literal, and opens a dated `CHANGELOG.md` section. Review the diff and flesh out the changelog. Add `--commit` to also commit and create the `vX.Y.Z` tag — pushing that tag triggers `.github/workflows/release.yml` (the reliable way to build the Windows `.exe` and universal macOS builds on native runners). The desktop **About** view and `reporter-term --version` will report this number; the git commit + build date are stamped into the desktop bundle automatically.

1. **Clean build of packages + web + server:**

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm test
   ```

2. **Server Docker image:**

   ```bash
   docker build -t reporter-server:$(node -p "require('./package.json').version") .
   ```

   Verify it boots against a scratch Postgres (`docker compose up` in a temp env), applies migrations, and serves `/web/flags`.

3. **Desktop installers** (build on/for each target OS; cross-building is limited):

   ```bash
   pnpm --filter @reporter/desktop build
   cd apps/desktop && CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --publish never
   ```

   Targets: dmg + zip (macOS arm64/x64), nsis (Windows), AppImage + deb (Linux). Output in `apps/desktop/release/`. `CSC_IDENTITY_AUTO_DISCOVERY=false` skips code-signing for local/unsigned builds. The Electron version is pinned in `electron-builder.yml` (`electronVersion`) so it resolves under pnpm's hoisted layout.

4. **Terminal recorder npm tarball:**
   ```bash
   pnpm --filter @reporter/term run pack
   ```
   NOTE: use `run pack` (not `pnpm pack`, which is a built-in that ignores the script and mis-handles the workspace deps). Produces `apps/term/reporter-term-<version>.tgz`, installable with `npm install -g ./apps/term/reporter-term-<version>.tgz`.

## Report

List every artifact with its path and size:

- `reporter-server:<version>` image id
- `apps/desktop/release/*` installers
- `reporter-term-<version>.tgz`

Note any target that couldn't be built on the current OS (e.g. Windows nsis from macOS) and what host is needed.
