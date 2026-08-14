# reporter-term

Record terminal sessions and upload them to a reporter server as terminal-recording evidence. Recordings are saved in the widely-supported **asciicast v2** format and play back in the reporter web UI (and any asciinema player).

## Install

```bash
npm install -g @reporter/term
```

Requires Node.js 20+. `node-pty` (a native addon) is installed alongside. It ships prebuilt binaries for **macOS and Windows**; on **Linux** it compiles on install, so install a toolchain first: `sudo apt-get install -y python3 make g++` (Debian/Ubuntu) or the equivalent.

> Published to a registry, `@reporter/term` installs as above. Building from this repo, produce the tarball with `pnpm --filter @reporter/term run pack` and `npm install -g ./apps/term/reporter-term-<version>.tgz`.

## First run

Running `reporter-term` with no configuration launches an interactive setup:

```bash
reporter-term
```

It asks for your **server URL**, **access key**, **secret key** (from the web UI under **Account → API keys**), preferred **shell**, and a **recordings folder**, then verifies the connection.

Re-run setup any time with `reporter-term setup`.

## Usage

```bash
reporter-term                 # record a session (default command)
reporter-term upload FILE     # upload a previously saved .cast file
reporter-term setup           # reconfigure
reporter-term config          # show the config file path and current values
```

**Recording:** `reporter-term` drops you into your shell inside a recorded PTY. Work as normal; type `exit` or press **Ctrl-D** to stop. Then choose:

- **Upload to reporter** — pick an engagement, add a description and tags, and it uploads. (Optionally delete the local copy afterward.)
- **Keep locally only** — the `.cast` stays in your recordings folder.
- **Discard** — delete it.

If an upload fails, the recording is kept locally and you can retry with `reporter-term upload <file>`.

## Configuration

Stored at the platform config path (shown by `reporter-term config`), e.g.:

- Linux: `~/.config/reporter-term/config.json`
- macOS: `~/Library/Application Support/reporter-term/config.json`
- Windows: `%APPDATA%\reporter-term\config.json`

The file is written with `0600` permissions and contains your API secret — keep it protected.

## Platform notes

- **macOS / Linux** — fully supported.
- **Windows** — supported via ConPTY (through `node-pty`); considered tier-2. Recordings occasionally include stray VT resize/clear sequences, and window-resize events use stdout resize rather than SIGWINCH.

## Build from source

```bash
pnpm install
pnpm --filter @reporter/term dev            # run via tsx
pnpm --filter @reporter/term build          # esbuild bundle → dist/index.js
```

The bundle keeps `node-pty` external (a native addon can't be embedded), so it is installed as a normal dependency alongside the published package.
