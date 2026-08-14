# reporter desktop

A cross-platform tray app for capturing screenshots and code blocks and submitting them to a reporter server as evidence.

## Install

Download the installer for your OS from your release location (see the `release`
skill / `electron-builder` output), or build it yourself (below).

- **macOS** — `reporter-<version>.dmg` (arm64 + x64). The build is **signed but not notarized**, so after dragging to Applications, clear the quarantine flag once: `xattr -dr com.apple.quarantine /Applications/reporter.app`. (A "damaged and can't be opened" error means an older, unsigned build — rebuild with the current `afterPack` hook, which signs the bundle.)
  - **Screen Recording resets after every rebuild?** That's the symptom of an **ad-hoc** build (the default). Ad-hoc signing gives the app no stable identity — macOS identifies it by its content hash, which changes on every rebuild, so the grant you gave the previous build no longer applies and you're re-prompted. Fix it once by building with a **stable code-signing identity** (see [Stable signing](#stable-signing-for-persistent-macos-permissions) below); then a single grant persists across all rebuilds and copies.
- **Windows** — `reporter Setup <version>.exe` (NSIS).
- **Linux** — `reporter-<version>.AppImage` (`chmod +x`, then run) or the `.deb`.

## First run

1. Open **Settings** (tray → Settings, or the window nav).
2. Enter the **Server URL** (e.g. `http://reporter.lan:8080`), your **Access key**, and **Secret key** — generate a pair in the web UI under **Account → API keys**.
3. Click **Test connection**; on success it loads your engagements.
4. Choose a **Current engagement** (tray → Engagement, or Settings). Captures go there.

## Capturing

From the tray menu (or global hotkeys):

- **Capture area** — default `⌘/Ctrl + Shift + 7`
- **Capture window** — default `⌘/Ctrl + Shift + 8`
- **Add code block from clipboard**

After a capture, a compose window opens: add a description and tags, confirm the engagement, and **Add evidence**. Items queue locally and upload automatically; failed uploads can be retried from **History**.

### Per-OS capture notes

- **macOS** uses the native `screencapture` tool (you'll be asked for **Screen Recording** permission the first time). No configuration needed. After granting, **quit and relaunch the app** — macOS only applies a new Screen Recording grant on the next launch. If you're re-prompted on a build you already granted, see [Stable signing](#stable-signing-for-persistent-macos-permissions).
- **Linux / Windows** use a **capture command** template (Settings → Capture) with a `$FILE` placeholder. Examples:
  - GNOME: `gnome-screenshot -a -f $FILE`
  - KDE: `spectacle -rbn -o $FILE`
  - wlroots (Wayland): `grim -g "$(slurp)" $FILE`
- **Wayland**: global hotkeys don't work (OS restriction). Use the tray menu, or bind a desktop shortcut to `reporter-desktop --capture-area`.

## Secret storage

The secret key is encrypted at rest via the OS keychain (macOS Keychain, Windows Credential Vault, Linux libsecret). On Linux without a keyring, storage falls back to weak encryption and the app shows a warning in Settings.

## Build from source

```bash
pnpm install
pnpm --filter @reporter/desktop dev        # run with hot reload
pnpm --filter @reporter/desktop build       # compile main/preload/renderer
pnpm --filter @reporter/desktop package     # electron-builder installers → apps/desktop/release/
```

The `afterPack` hook (`scripts/afterPack.cjs`) signs the bundle so it launches on other Apple Silicon Macs (electron-builder otherwise leaves a broken signature after injecting `app.asar`, which Gatekeeper reports as "damaged"). By default it **ad-hoc** signs; set `REPORTER_SIGN_IDENTITY` to sign with a real identity instead (below). Full notarization (a prompt-free install) requires an Apple Developer ID — see `electron-builder.yml`.

### Stable signing (for persistent macOS permissions)

Ad-hoc signing pins the app's identity to its content hash, so **macOS permission grants (Screen Recording, Accessibility, …) reset on every rebuild**. Signing with a stable code-signing certificate anchors the app's _designated requirement_ to the certificate instead, so one grant survives every rebuild and every copy.

You don't need a paid Apple account for local dev — a **self-signed code-signing certificate** is enough:

1. Open **Keychain Access** → menu **Keychain Access → Certificate Assistant → Create a Certificate…**
2. Name: `Reporter Dev` · Identity Type: **Self Signed Root** · Certificate Type: **Code Signing** → Create.
3. Build with that identity:
   ```bash
   REPORTER_SIGN_IDENTITY="Reporter Dev" pnpm --filter @reporter/desktop package
   ```
   The `afterPack` hook prints the resulting **designated requirement**; confirm it's anchored to the certificate (`... and certificate leaf = H"…"`) rather than a `cdhash` — that's what makes the grant stable.
4. Install/replace the app, grant **Screen Recording** once, and **quit + relaunch**. Future rebuilds signed with the same cert keep the grant.

If macOS is still re-prompting after switching to a stable cert (because it remembers the old ad-hoc grants), clear the stale state once and re-grant:

```bash
tccutil reset ScreenCapture local.reporter.desktop
```

For a **prompt-free install on other people's Macs**, use a paid **Apple Developer ID** cert (`REPORTER_SIGN_IDENTITY="Developer ID Application: …"`) plus notarization — see `electron-builder.yml`.

## Version & updates

Open **About** (tray → _About reporter_, or the window nav) to see the app
version, the exact build (git commit + date), the Electron/Chromium/Node
versions, and the server you're pointed at. **Check for updates** compares your
version against the latest published release and links to the download when a
newer one exists.

The version is single-sourced from `package.json` and bumped repo-wide with
`pnpm run version:bump` (see the root `CLAUDE.md` → _Versioning & releases_).
Pushing a `vX.Y.Z` tag builds the installers for each OS on native CI runners.

## Notes

- The local queue and settings are stored as JSON via `electron-store` in the app's user-data directory. (For very large queues, `better-sqlite3` is a drop-in upgrade, at the cost of a native-module rebuild step.)
- The app is tray-only (no dock icon on macOS); closing the window keeps it running. Quit from the tray menu.
