# reporter desktop

A cross-platform tray app for capturing screenshots and code blocks and submitting them to a reporter server as evidence.

## Install

Download the installer for your OS from your release location (see the `release`
skill / `electron-builder` output), or build it yourself (below).

- **macOS** — `reporter-<version>.dmg` (arm64 + x64). Unsigned local builds: right-click the app → **Open** the first time to bypass Gatekeeper.
- **Windows** — `reporter Setup <version>.exe` (NSIS).
- **Linux** — `reporter-<version>.AppImage` (`chmod +x`, then run) or the `.deb`.

## First run

1. Open **Settings** (tray → Settings, or the window nav).
2. Enter the **Server URL** (e.g. `http://reporter.lan:8080`), your **Access key**, and **Secret key** — generate a pair in the web UI under **Account → API keys**.
3. Click **Test connection**; on success it loads your operations.
4. Choose a **Current operation** (tray → Operation, or Settings). Captures go there.

## Capturing

From the tray menu (or global hotkeys):

- **Capture area** — default `⌘/Ctrl + Shift + 7`
- **Capture window** — default `⌘/Ctrl + Shift + 8`
- **Add code block from clipboard**

After a capture, a compose window opens: add a description and tags, confirm the operation, and **Add evidence**. Items queue locally and upload automatically; failed uploads can be retried from **History**.

### Per-OS capture notes

- **macOS** uses the native `screencapture` tool (you'll be asked for **Screen Recording** permission the first time). No configuration needed.
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

Code-signing and notarization are not configured (local/unsigned builds). See `electron-builder.yml` to add signing for distribution.

## Notes

- The local queue and settings are stored as JSON via `electron-store` in the app's user-data directory. (For very large queues, `better-sqlite3` is a drop-in upgrade, at the cost of a native-module rebuild step.)
- The app is tray-only (no dock icon on macOS); closing the window keeps it running. Quit from the tray menu.
