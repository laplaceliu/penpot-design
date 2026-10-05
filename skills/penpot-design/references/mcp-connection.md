# Connecting Penpot MCP guide

## 0. Pre-start check (confirm whether Penpot / MCP is ready)

**Don't default to directly `install.ps1` / `up.sh`**. Probe first, act with the minimal necessary action: saves time (pulling images ~5min) and avoids accidentally overwriting an existing deployment or re-running `create-profile`.

### 0.1 Probe Penpot service status

- Preferred: `scripts/status.{sh,ps1}` — outputs container status + HTTPS liveness (`/` and `/api/main/methods/get-enabled-flags` HTTP code).
  - Both probes `200` → **service already running, jump to §4 verification**.
  - Container exists but status not `Up` → just `up.{sh,ps1}` to bring up, **don't reinstall**; data volumes (postgres/valkey) preserved, account still there, no `create-profile` needed.
  - `compose ps` errors / no container / no `$STACK/docker-compose.yml` → full install needed (§1).
- Quick alternative (no script env): `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags`, returns 200 = already up.

### 0.2 Probe MCP client config

- Does the workspace `.mcp.json` contain a `penpot` entry with `url` `https://penpot.local/mcp/stream`.
- Is `NODE_EXTRA_CA_CERTS` set, and does the CA cert file exist: `$STACK/data/caddy/pki/authorities/local/root.crt` (only generated after trust-ca ran).
  - Both satisfied and §0.1 endpoint reachable → **MCP ready, directly §4 verify**, don't re-run trust-ca / don't change `.mcp.json`.
  - Config present but endpoint down → just start the service (§0.1's `up`).
  - Not configured → configure `.mcp.json` per §3 + run `trust-ca` + **restart the client**.

### 0.3 Confirm action (to user)

Report the probe conclusion in one or two sentences, and use `ask_followup_question` to let the user confirm the next step (lightweight probing itself doesn't bother the user):

| Probe conclusion | Suggested action | Ask? |
|---|---|---|
| Service running + MCP configured | directly verify (§4) | No, verify directly |
| Service stopped + MCP configured | just `up` | Yes (confirm "start only") |
| No deployment / not configured | full install + config | Yes (confirm "full install, ~5min") |
| Service running but MCP not configured | configure MCP only (trust-ca + `.mcp.json` + restart client) | Yes |

> Key principle: reuse when possible, start-only when possible, **never** reinstall or re-run `create-profile` when already ready.

### 0.4 Troubleshooting: `Connect Timeout Error (attempted address: penpot.local:443)`

This error **does not mean the client config is wrong**; it means the endpoint isn't listening at all. Judge in this order, **don't reinstall upfront**:

| Symptom | Judgment | Action |
|---|---|---|
| `curl https://penpot.local` → `000`, but the container's `status` shows `Up` | caddy not ready yet or port not mapped | wait 10–20s and retry |
| `dockerDesktopLinuxEngine/.../containers/json` → `500`, "check if the server supports the requested API version" | Docker Desktop engine just recovered / API version negotiation jitter | **recheck with real docker** (below), if reachable ignore this 500 |
| Engine reachable but `docker compose ls` has no project / no container | stack truly not up | `up.{sh,ps1}` to bring up; data volume present, **no** `create-profile` |
| Engine itself unreachable (`docker version` can't connect) | Docker Desktop not started | start Docker Desktop, wait for engine ready then `up` |

**Windows trap: the `docker` on PATH may be a podman shim.**
In the tested env, `where docker`'s first hit is `H:\dev\shim\docker.cmd`, whose content forwards args to `podman.exe`:

```bat
@echo off
call "%~dp0_wslup.cmd"
set "DOCKER_HOST=tcp://127.0.0.1:2375"
"%~dp0..\bin\podman.exe" %*
```

At this point `docker ps` reports `Cannot connect to Podman socket ... A socket operation encountered a dead network`,
**which looks like "all containers down" but is actually asking the wrong backend**. This stack's `lib.ps1` explicitly uses **Docker Desktop** as the engine
(`docker compose` / `docker-compose`) and actively skips the PATH shim.
Recheck with the real binary:

```powershell
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $d version --format 'client={{.Client.Version}} server={{.Server.Version}} api={{.Server.APIVersion}}'
& $d compose ls -a
& $d ps -a --format "{{.Names}} | {{.Status}}"
```

**Service is up but the tool is still unusable**: `/mcp` returns 200, the MCP container log shows tools registered,
but `execute_code` says "tool does not exist or is not registered" →
it's the **client dropped the MCP server registration** (lost after connection failures repeatedly interrupted). Then:
1. confirm the client config (Windows: `%USERPROFILE%\.codebuddy\mcp.json`, not the workspace `.mcp.json`) has
   `url` `https://penpot.local/mcp/stream?userToken=...`; bare curl hitting `/mcp/stream` returning **406 is normal**
   (missing SSE Accept header), not a fault;
2. **reload the IDE window / reconnect MCP servers**, letting the client re-read the config and register penpot tools;
3. also the Penpot plugin panel in the browser must be open and already connected to the bridge (WS 4402) for `execute_code` to reach files.

### 0.5 Troubleshooting: browser suspends the Penpot tab (the #1 killer of long sessions)

`execute_code` reports:

```
The Penpot plugin tab appears to be suspended by the browser (no heartbeat for 194s).
Please click/focus the Penpot tab to wake it, then retry.
```

**This is the browser (Chrome Memory Saver / Edge Sleeping tabs) putting the background tab to sleep, not a service or config problem.**
The heartbeat counter only increases and never decreases, indicating the tab is in a frozen state; at this point any tool call fails.

You can see the complete timeline clearly from the container log (real case):

```
01:54:52  Tool #1 failed: No Penpot instance connected for user token.   ← plugin not connected
02:07:26  (PluginBridge): New WebSocket connection established (token provided)  ← plugin connected
02:10:40  Tool #3 failed: ... suspended by the browser (no heartbeat for 194s)   ← immediately suspended
```

That is "plugin just connected then immediately suspended" — after the user switched to the IDE window, the Penpot tab went to background and got frozen.

**Mechanism (read from the container's `index.js`, not guessed)**:

```js
var HEARTBEAT_STALE_THRESHOLD_MS = 3e4;                       // 30s, hardcoded
function assertPluginResponsive(state, now, staleThresholdMs = HEARTBEAT_STALE_THRESHOLD_MS) {
  const heartbeatAge = now - state.lastHeartbeat;
  if (heartbeatAge > staleThresholdMs) { throw ... }          // error text uses this constant
}
```

- The threshold **30 seconds is hardcoded, cannot be relaxed via env var**; `PENPOT_MCP_TOOL_TIMEOUT_S` only governs the tool's own timeout, unrelated to this check.
  No plugin heartbeat for over 30s, the server **rejects all tool calls** (`execute_code` / `export_shape` all fail).
- The plugin-side heartbeat message is `{type:"heartbeat"}`, the server refreshes `connection.lastHeartbeat` each time it receives one.

**Diagnostic rule: see whether the heartbeat counter has ever been reset.**
- Counter **never resets, monotonically increases** → if "already over threshold soon after reconnect (e.g. 34s)", it means **not a single heartbeat ever came**,
  i.e. the page **was hidden from the start** (not "visible but throttled").
- Tested counter-evidence: in one real build of this skill, the browser window was **visible but unfocused** (focus on IDE),
  ran ~40 tool calls in one go, heartbeat always normal. **So "unfocused" itself doesn't cause suspension.**
- Conclusion: when the counter has never reset, the problem is almost certainly that **the tab is not the current selected tab of its window** (switched to another tab in the same window),
  or the window is minimized / fully occluded. Power-saving settings (Memory Saver / Sleeping tabs) are usually the **secondary** cause.

**Handling**:
1. **In that browser window, click the Penpot tab to make it the current selected tab** (not just place the window aside), then immediately retry;
2. For `penpot.local`, turn off the browser's power-saving policy (Chrome: Settings → Performance → Memory Saver, whitelist this site;
   Edge: Settings → System and Performance → turn off "Use sleeping tabs" / whitelist the site);
3. For long sessions, suggest opening the Penpot tab **in a separate window and keeping it visible** (side by side with the IDE), don't hide it in a background tab group;
4. For batch automation, organize by "small batch + persist progress at each batch end" (see `positioning-audit.md` G6),
   so after suspension/disconnection you can resume without rebuilding from scratch.

> Quick criteria: **`No Penpot instance connected` = plugin not connected; `suspended by the browser` = connected but tab frozen;
> `tool does not exist or is not registered` = client dropped the server registration; `Connect Timeout ... penpot.local:443` = stack not running.**
> The fixes for the four faults are completely different; read the original error first.

### 0.6 Troubleshooting: `No Penpot instance connected for user token`

**This is the exclusive error of "client↔server ok, server↔browser disconnected"**, different from the disconnection in §0.4, don't confuse. Criteria:

| Phenomenon | Meaning |
|---|---|
| `high_level_overview` / `penpot_api_info` return normally | client↔MCP server **connected** (these two tools are server-local, don't need the browser) |
| `execute_code` says `No Penpot instance connected for user token` | MCP server↔browser **disconnected** (`execute_code` is the only channel that reaches files) |
| Server log only has `WebSocket mcpServer started on port 4402`, no subsequent plugin-connection line | browser plugin **never connected** (not dropped, not installed/not running) |
| Log shows stable `userTokenFp=<fp>` | client token is fine, problem is browser-side |

**Browser-side wiring (about 1 minute per tier)**:

1. Open `https://penpot.local` and log in (`admin@penpot.local` / `penpot123`).
2. Open the target design file.
3. Install/enable the plugin, **manifest address**: `https://penpot.local/plugins/mcp/manifest.json`
   (plugin name **Penpot MCP Plugin**, permissions `content:read/write`, `library:read/write`, `comment:read/write`).
4. **Run this plugin in that file** — it establishes the bridge between the file and the MCP server.
   The bridge is **per-file / per-session**: after refresh or switching files you need to re-run the plugin.

**Endpoint self-check (all curl-decidable, don't guess)**:

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/plugins/mcp/manifest.json   # 200 = plugin installable
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/mcp/stream                  # 406 = server alive (missing SSE header, normal)
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/mcp/ws                      # 426 = bridge endpoint alive (missing Upgrade header, normal)
```

These three codes are **healthy states**, don't treat them as faults. Conversely: `manifest` 404 = frontend nginx didn't proxy to `penpot-mcp`
(check `docker exec <frontend> cat /etc/nginx/overrides/server.d/mcp-locations.conf`,
should have `/mcp/ws → penpot-mcp:4402`, `/mcp/stream → penpot-mcp:4401/mcp`, `/mcp/sse → penpot-mcp:4401/sse`).

**Diagnostic log angle** (Windows note: the `docker` on PATH may be a podman shim, see §0.4):

```powershell
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $d logs --tail 40 penpot-server-penpot-mcp-1
# care about two kinds of lines: PluginBridge (plugin connection) and userTokenFp=x (client session)
```

## 1. Prerequisite: local Penpot deployment

The deployment stack **ships with this skill**: `assets/penpot-server/` (compose stack 7 services: penpot-{frontend,backend,exporter,mcp,postgres,valkey} + caddy, Penpot 2.18, Caddy terminating HTTPS at `https://penpot.local`). Full explanation in `assets/penpot-server/README.md`.

> **Why no absolute paths**: the stack root is reverse-derived by scripts from their own location, so copying `assets/penpot-server/` to any location (`~/penpot`, `C:\penpot`, CI workspace) runs the same, no path changes needed. Linux/macOS use `scripts/lib.sh` (`BASH_SOURCE` + stepwise symlink resolution), Windows uses `scripts/lib.ps1` (`$PSScriptRoot`). The `$STACK` below refers to the stack directory (default = `<SKILL_DIR>/assets/penpot-server`, `<SKILL_DIR>` = the directory containing this skill's `SKILL.md`).

### 1.1 Image tag convention (the #1 cause of "Version mismatch")

- **Tag is two-segment minor, not three-segment patch**: write `2.18`, **don't** write `2.18.0`. `2.18` actually resolves to `2.18.1`.
- The four `penpotapp/*` images must come from the **same build**. Images carry `org.opencontainers.image.version` and
  `org.opencontainers.image.revision` labels, self-verifiable:

  ```powershell
  $d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
  foreach ($i in 'frontend','backend','exporter','mcp') {
    $l = (& $d inspect "penpotapp/${i}:2.18" --format '{{json .Config.Labels}}' | ConvertFrom-Json)
    "$i -> $($l.'org.opencontainers.image.version') $($l.'org.opencontainers.image.revision')"
  }
  # the four revisions must match. Tested 2.18 = version 2.18.1 / revision 423cb411324d
  ```

- **Symptom → prescription**: the plugin shows
  `Version mismatch detected: This version of the MCP server is intended for Penpot X while the current version is Y`
  → `penpotapp/mcp` and `penpotapp/frontend` are not the same build. **Only change `.env`'s `PENPOT_IMAGE_TAG` in one place**
  (the four image lines in `compose.yaml`, and the default value in `prewarm.{sh,ps1}`, all read the same variable), then rebuild.

- **Upgrade is a full rebuild**, fixed order:

  ```bash
  # 1) Stop the stack first, cold backup (backend runs irreversible DB migration on startup, must leave an escape)
  ./scripts/down.{sh,ps1}
  cp -r ./data/postgres/data ./data/postgres/data-backup-<oldtag>
  # 2) Change .env's PENPOT_IMAGE_TAG=<newtag>
  # 3) Pull images → bring up (auto-migrate)
  ./scripts/prewarm.{sh,ps1}
  ./scripts/up.{sh,ps1}
  # 4) Verify: all containers Exited become Up, and the three endpoint codes are healthy
  ```

  After migration, self-prove data is intact (Penpot stores pages in `file.data`'s **bytea**, don't expect to SQL-parse the page tree):

  ```bash
  docker exec penpot-server-penpot-postgres-1 psql -U penpot -d penpot -t -A -F ' | ' \
    -c "SELECT name, pg_size_pretty(length(data)::bigint), revn, modified_at FROM file ORDER BY created_at;"
  ```

  Keep the old-tag images for now (the only quick rollback path), `docker rmi` to reclaim disk after confirming the new version is stable.

**Engine**: scripts auto-detect — prefer `podman compose` (Podman Desktop recommended on Windows), otherwise fall back to `docker compose` / `docker-compose`.

**Linux / macOS (bash)**:

```bash
STACK=<SKILL_DIR>/assets/penpot-server   # directory can be moved whole, $STACK changes accordingly
cd "$STACK" && cp .env.example .env # optional: change image tag / domain / secret
./scripts/prewarm.sh                # first pull images (~5 min)
./scripts/up.sh                     # start + wait until https://penpot.local ready (auto-patches /etc/hosts)
./scripts/trust-ca.sh               # install CA → see §3 (MCP client required)
./scripts/create-profile.sh         # create login account (empty fresh DB requires it; idempotent)
./scripts/status.sh                 # container status + HTTPS liveness + cert + disk usage
./scripts/tail-logs.sh <service>    # follow single-service log
./scripts/down.sh [--volumes]       # stop (--volumes clears data, irreversible)
```

**Windows (PowerShell, recommended admin terminal)**:

```powershell
$STACK = "<SKILL_DIR>\assets\penpot-server"
cd $STACK
Copy-Item .env.example .env                              # optional
.\scripts\install.ps1                                   # one-click: prewarm→up→trust-ca→create-profile
# or step by step:
.\scripts\prewarm.ps1
.\scripts\up.ps1
.\scripts\trust-ca.ps1
.\scripts\create-profile.ps1                            # create login account (empty fresh DB requires it; idempotent)
.\scripts\status.ps1
.\scripts\tail-logs.ps1 <service>
.\scripts\down.ps1 [-Volumes]
```

Login credentials (seeded by `create-profile.sh`): `https://penpot.local/`, `admin@penpot.local` / `penpot123` (change password at `/auth/profile` after login). When changing the hostname to `PENPOT_HOST`, sync-change `.env`'s `PENPOT_PUBLIC_URI` and the `caddy/Caddyfile` site block.

## 2. MCP endpoints

| Channel | URL |
|---|---|
| Streamable HTTP (recommended) | `https://penpot.local/mcp/stream` |
| Legacy SSE | `https://penpot.local/api/mcp/sse` |

## 3. Client config (CodeBuddy / Codex / VSCode generic)

```json
{
  "mcpServers": {
    "penpot": {
      "type": "http",
      "url": "https://penpot.local/mcp/stream"
    }
  }
}
```

- CodeBuddy: write into the workspace `.mcp.json` (or fill the above URL in the CodeBuddy MCP settings panel).
- **CA is independent per stack**: `$STACK/data/caddy/pki` is generated on first startup; moving the stack dir / copying a fresh copy = changing the CA, and if the browser and client still trust the old one it errors (not a broken script). Solution in `assets/penpot-server/README.md` "Moved directory / re-clone and the browser reports a cert error": reuse the old PKI, or re-run the trust script and restart the browser.
- Endpoint goes through Caddy self-signed TLS. Node/Electron clients don't read the system cert store, must set it (scripts handle it automatically).

  - **Linux/macOS**: `./$STACK/scripts/trust-ca.sh` writes into the system OpenSSL store + NSS (Chrome/Edge/Playwright) + Firefox + `NODE_EXTRA_CA_CERTS` (writes `~/.zshenv`, `~/.bashrc`, `/etc/environment`). When specifying manually:

    ```bash
    export NODE_EXTRA_CA_CERTS="$STACK/data/caddy/pki/authorities/local/root.crt"
    ```

  - **Windows**: `.\$STACK\scripts\trust-ca.ps1` installs the CA into the **current user**'s `Trusted Root Certification Authorities` store and writes the **user-level** `NODE_EXTRA_CA_CERTS` (no admin needed). When specifying manually (PowerShell):

    ```powershell
    $env:NODE_EXTRA_CA_CERTS = "$STACK\data\caddy\pki\authorities\local\root.crt"
    # persist (user-level):
    [Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', "$STACK\data\caddy\pki\authorities\local\root.crt", 'User')
    ```

**You must restart the AI client after setting the env var** (env doesn't inject into already-running processes). Otherwise it reports:

```
SSE error: TypeError: fetch failed: unable to get local issuer certificate
```

## 4. Connection verification

1. The MCP tool list shows 4 tools: `execute_code`, `export_shape`, `high_level_overview`, `penpot_api_info`.
2. Call `penpot_api_info` to confirm handshake success.
3. Call `high_level_overview` to confirm it can read the current file's page/board tree.
4. `execute_code` smoke test: `return {page: penpot.currentPage.name, pages: penpotUtils.getPages().map(p=>p.name)}`.

## 5. Available tools and their roles

| Tool | Purpose | Notes |
|---|---|---|
| `execute_code` | the only write channel: build pages/boards/components/change properties | sandbox execution, **30s timeout** |
| `export_shape` | export PNG for acceptance | can only export shapes on the **currently active page** |
| `high_level_overview` | read file structure | survey before build, compare before repair |
| `penpot_api_info` | API/connection info | troubleshooting |

## 6. execute_code session discipline (quick ref)

- **Page switch is async**: after `penpot.openPage(pageObj)`, operations in the same call may hit the old page. Defensive verification at the start of each command: `openPage(pg); await sleep(400); if (penpot.currentPage.name !== 'target page') return {err: penpot.currentPage.name};`
- `openPage` only accepts a Page object or UUID: `storage.pg = n => penpotUtils.getPageByName(n)`.
- **Storage is volatile**: lost on plugin reconnect/crash; probe `storage.mkText` etc. before each batch, re-seed if missing (`scripts/seed_storage.js`).
- **Batch limit**: each call ≤8 primitives or ≤10 text; timeout may partially take effect, probe residue before retry.
- Cross-page modification reports "Cannot modify a page that is not currently active" → first activate the page it belongs to.
- Return values only give raw values (number/string/flat array); complex objects fail structuredClone.
- Crash damage: the last batch's board/rect/ellipse may degrade to 100×100 (detected as exactly 100×100 non-text primitive), resize per spec; disabling WebGL significantly stabilizes; mild hang self-heals after sleep 60~120s.

Layout three approaches in order: A bare board + world-coordinate appendChild (note export-offset risk) → B flex auto-layout (watch for hug collapse) → **C flex container + all absolute + world coordinates (recommended fallback)**. Full engines and pitfall table are in this skill's `references/`: mcp-automation.md (discipline/quick-ref) / api-pitfalls.md (mechanism details and three-approach tested table) / engines.md (engine mechanism and page recipes); engine code is in `scripts/`.
