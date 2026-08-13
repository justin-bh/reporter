# @reporter/term — component guide

`reporter-term`: a Node CLI that records shell sessions and uploads them as terminal-recording evidence. `node-pty` + `@clack/prompts` + `commander`. Talks to the server via `@reporter/api-client` (HMAC).

## Flow

1. `reporter-term` with no config → first-run wizard (server URL, access/secret key, `checkConnection()`, shell, output dir).
2. Record: spawn `$SHELL` in a PTY at TTY size, raw-mode passthrough, stream **asciicast v2** NDJSON to disk (`[t,"o",data]`; resize `[t,"r","WxH"]`).
3. On exit (`exit`/Ctrl-D): @clack menu → rename / description / tag multiselect / operation pick → Upload | Save | Discard.
4. `reporter-term upload <file.cast>` retries a saved recording.

## Rules

- asciicast **v2** (universal player support). Stream to disk so a crash loses nothing.
- Colors/symbols come from `src/theme.ts` (brand ANSI map) — no inline ANSI. Same glossary/tone as the GUI.
- Config via `env-paths` (`~/.config/reporter-term/config.json`, platform-appropriate).

## Gotchas

- Windows: ConPTY via node-pty works but is tier-2 (possible VT artifacts); no SIGWINCH — use stdout `resize`.
- Distributed via npm (`npm i -g @reporter/term`); esbuild-bundle JS with `node-pty` kept external (native addon can't be embedded in a SEA).

## Verify

Record a `vim`/`htop` session → upload → confirm it plays in the web `TerminalPlayer`.
