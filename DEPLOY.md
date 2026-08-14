# Deploying reporter

This guide covers deploying the **server** on an Ubuntu machine and installing the **desktop app** (macOS) and **terminal recorder** (macOS/Linux) that connect to it.

- Part A — [Server on Ubuntu](#part-a--server-on-ubuntu)
- Part B — [Desktop app on macOS](#part-b--desktop-app-on-macos)
- Part C — [Terminal recorder](#part-c--terminal-recorder)
- [Getting API keys](#getting-api-keys) · [Updating](#updating) · [Backups](#backups) · [Troubleshooting](#troubleshooting)

The only thing your teammates' machines need to reach is the server's URL (e.g. `http://192.168.1.50:8080`). Everything else is local to each machine.

---

## Part A — Server on Ubuntu

### 1. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # then log out/in so `docker` works without sudo
```

Verify: `docker compose version`.

### 2. Get the code

```bash
git clone <your-repo-url> reporter
cd reporter
```

(Or copy the project directory to the server via `scp`/`rsync`.)

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Set to |
|----------|--------|
| `SESSION_SECRET` | a long random string — generate with `openssl rand -hex 32` |
| `DB_PASSWORD` | a strong database password |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first admin login (or leave blank to use the web `/setup` screen) |
| `APP_URL` | `http://<server-ip>:8080` (the URL clients/browsers will use) |

Quick generation:

```bash
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 16)|" .env
```

### 4. Launch

```bash
docker compose up -d --build
```

The first run builds the image (a few minutes), starts PostgreSQL, applies database migrations automatically, and — if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set — creates the first admin.

Check it:

```bash
docker compose ps
curl -s http://localhost:8080/web/flags        # {"appName":"reporter","needsSetup":false,...}
docker compose logs -f app                      # watch boot / migrations
```

Open `http://<server-ip>:8080` in a browser and sign in. (If you left the admin vars blank, the first visit shows a one-time **Create admin** screen.)

### 5. Open the firewall (if `ufw` is enabled)

```bash
sudo ufw allow 8080/tcp
```

### 6. (Optional) HTTPS with a reverse proxy

The default is plain HTTP for a trusted LAN. For HTTPS, front it with [Caddy](https://caddyserver.com) (automatic certificates). Add to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2
    ports: ['80:80', '443:443']
    command: caddy reverse-proxy --from reporter.example.com --to app:8080
    depends_on: [app]
    restart: unless-stopped
```

Then set `APP_URL=https://reporter.example.com` in `.env` (this makes session cookies `Secure`) and `docker compose up -d`.

---

## Part B — Desktop app on macOS

The desktop app is distributed as a `.dmg`. You build it once on a Mac, then install it on any Mac.

### Build the installer (once, on a Mac)

Prerequisites: [Node.js 20+](https://nodejs.org) and pnpm (`npm install -g pnpm`).

```bash
cd reporter
pnpm install
pnpm --filter @reporter/desktop build
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --publish never
```

Output lands in `apps/desktop/release/`:
- `reporter-<version>-arm64.dmg` (Apple Silicon) / `reporter-<version>.dmg` (Intel)
- `.zip` equivalents

> The build is **ad-hoc signed** (via the `afterPack` hook) but **not notarized** — so it launches on any Mac after clearing quarantine (below), but is not distributed through Apple's notary service. For a prompt-free install, add an Apple Developer signing identity + notarization in `apps/desktop/electron-builder.yml`.

### Install

1. Open the `.dmg` and drag **reporter** to Applications.
2. **Clear the quarantine flag** so Gatekeeper allows the un-notarized app. In Terminal:
   ```bash
   xattr -dr com.apple.quarantine /Applications/reporter.app
   ```
   (macOS adds this flag to anything copied from another Mac / downloaded. Without this step you'll see an "unidentified developer" prompt; on macOS 15+ the right-click→Open shortcut no longer works, so the command above is the reliable method.)
3. Launch it — the app runs in the **menu bar** (tray), not the Dock.

> **"reporter.app is damaged and can't be opened"** means the app has a broken/absent signature (an older unsigned build, or the bundle was modified). Use a `.dmg` built with the current `afterPack` ad-hoc-signing hook; if you must fix a copy in place, re-sign it: `codesign --deep --force --sign - /Applications/reporter.app` then run the `xattr` command above (requires Xcode Command Line Tools).

### Configure

1. Click the menu-bar icon → **Settings**.
2. Enter the **Server URL** (`http://<server-ip>:8080`) and your **Access key** + **Secret key** — see [Getting API keys](#getting-api-keys).
3. Click **Test connection**; on success it loads your operations. Pick a **Current operation**.

### Grant Screen Recording permission

The first screenshot capture triggers a macOS **Screen Recording** permission prompt (System Settings → Privacy & Security → Screen Recording). Enable **reporter** and relaunch it.

### Use

- Menu-bar menu → **Capture area** / **Capture window**, or the global hotkeys **⌘⇧7** / **⌘⇧8**.
- Add a description + tags in the compose window → **Add evidence**. Items queue and upload automatically; **History** shows status and lets you retry failures.

---

## Part C — Terminal recorder

`reporter-term` records shell sessions as asciicast and uploads them as evidence. Works on macOS and Linux.

### Build & install

Prerequisites: Node.js 20+ and pnpm.

```bash
cd reporter
pnpm install
pnpm --filter @reporter/term run pack          # NOTE: `run pack`, not `pnpm pack`
npm install -g ./apps/term/reporter-term-0.1.0.tgz
```

This produces a self-contained tarball (only `node-pty` is a runtime dependency) and installs the `reporter-term` command globally.

### Configure & use

```bash
reporter-term setup     # server URL + API keys (interactive); or just run `reporter-term` the first time
reporter-term           # records your shell — work as normal, then type `exit` or Ctrl-D
```

After the session ends, choose **Upload** (pick operation, description, tags), **Keep locally**, or **Discard**. Other commands: `reporter-term upload <file.cast>`, `reporter-term config`.

---

## Getting API keys

Both clients authenticate with an **access key + secret key** pair:

1. Sign in to the web UI (`http://<server-ip>:8080`).
2. Go to **Account → API keys → New key**.
3. Copy the **access key** and **secret key** (the secret is shown once). Paste them into the desktop app's Settings or `reporter-term setup`.

---

## Updating

**Server:**
```bash
cd reporter
git pull                       # or copy the new version over
docker compose up -d --build   # rebuilds; migrations re-apply automatically
```

**Clients:** rebuild the `.dmg` / tarball and reinstall (steps above).

## Backups

State lives in two places — the database and the blob volume:

```bash
# Database
docker compose exec db pg_dump -U reporter reporter > reporter-db.sql
# Evidence blobs
docker run --rm -v reporter_blobdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/reporter-blobs.tgz -C /data .
```

Restore into a fresh stack: load the SQL with `psql`, and untar the blobs back into the volume. See [apps/server/README.md](apps/server/README.md#backup--restore).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `docker compose` build fails on `node-pty` | The provided Dockerfile installs the build toolchain; ensure you're using the repo's `Dockerfile` unchanged. |
| App container restarts, logs `PrismaClientInitializationError` | The runtime needs `openssl` (already in the Dockerfile). Rebuild with `docker compose up -d --build`. |
| `needsSetup: true` unexpectedly | The users table is empty — set `ADMIN_*` in `.env` and recreate the app container, or use the web `/setup` screen. |
| Desktop app "can't be opened" (unidentified developer) | Right-click the app → **Open** (unsigned build). |
| Desktop screenshots do nothing on macOS | Grant **Screen Recording** permission and relaunch. |
| Global hotkeys don't fire (Linux/Wayland) | Use the tray menu, or bind a shortcut to `reporter-desktop --capture-area`. |
| `reporter-term` install pulls wrong deps | Use `pnpm --filter @reporter/term run pack` (with `run`), then install the tarball it prints. |
