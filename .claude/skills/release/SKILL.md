---
name: release
description: Build all reporter deliverables — the packages, the server Docker image, the Electron desktop installers, and the reporter-term npm tarball — and list the produced artifacts. Use to cut a release build or verify everything packages cleanly.
---

# release

Produce every shippable reporter artifact and report where each landed.

## Steps

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
   pnpm --filter @reporter/desktop exec electron-builder --publish never
   ```
   Targets: dmg + zip (macOS arm64/x64), nsis (Windows), AppImage + deb (Linux). Output in `apps/desktop/release/`.

4. **Terminal recorder npm tarball:**
   ```bash
   pnpm --filter @reporter/term build
   pnpm --filter @reporter/term pack
   ```

## Report

List every artifact with its path and size:
- `reporter-server:<version>` image id
- `apps/desktop/release/*` installers
- `reporter-term-<version>.tgz`

Note any target that couldn't be built on the current OS (e.g. Windows nsis from macOS) and what host is needed.
