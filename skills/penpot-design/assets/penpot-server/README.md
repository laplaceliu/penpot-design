# penpot-ui

A one-click local Penpot design-platform deployment plus companion scripts. The whole directory is self-contained: after cloning to any
machine (`~/penpot`, `/srv/penpot`, a CI workspace, etc.), the scripts auto-locate
`compose.yaml`, `caddy/Caddyfile`, and `data/` without needing any path changes.

## Directory structure

```
.
├── compose.yaml          # 7 services: penpot-{frontend,backend,exporter,mcp,postgres,valkey} + caddy
├── caddy/Caddyfile       # https://penpot.local → penpot-frontend:8080
├── .env.example          # Copy to .env and edit as needed (.env is gitignored)
├── data/                 # Container state (gitignored): postgres / valkey / exports / caddy PKI
                          # Note: assets use the named volume penpot_assets, not a local dir
└── scripts/
    ├── lib.sh            # Common entry: path self-resolution, compose wrapper, permissions & /etc/hosts helpers
    ├── prewarm.sh        # Pre-pull all images (run this first on a fresh machine)
    ├── up.sh             # Start the stack and wait until https://penpot.local is ready
    ├── create-profile.sh # Create a login account (empty fresh DB requires it; idempotent)
    ├── down.sh           # Stop the stack [--volumes also deletes data]
    ├── status.sh         # Container status + HTTPS probe + certificate + disk usage
    ├── tail-logs.sh      # Follow a service's logs
    └── trust-ca.sh       # Install Caddy's internal CA into system / browser / Node trust stores
```

## Prerequisites

- **Linux / macOS**: Docker Engine + compose plugin (`docker compose` v2); the scripts also
  accept v1's `docker-compose`.
- **Windows**: **Docker Desktop** (`https://www.docker.com/products/docker-desktop`),
  which ships the compose plugin (`docker compose` v2, also compatible with v1's `docker-compose`). The scripts auto-detect.
  - On Windows all ops scripts are the **PowerShell** (`.ps1`) versions, one-to-one with the Linux `.sh`
    versions (see the table below). Run them in an **administrator terminal**, otherwise writing `hosts` is skipped.
- The first start needs `penpot.local` pointed to `127.0.0.1`:
  - Linux: the script auto `sudo`-writes `/etc/hosts`;
  - **Windows**: writes `C:\Windows\System32\drivers\etc\hosts`, requiring an **administrator**
    terminal; in a non-admin terminal the script prints the line to add manually and continues.

## Quick start

```bash
cp .env.example .env        # optional: change image tag / domain / secret
./scripts/prewarm.sh        # pull images first on a fresh machine, ~5 minutes
./scripts/up.sh             # start and wait until HTTPS is ready
./scripts/trust-ca.sh       # install CA (browser + Node/Electron MCP clients)
./scripts/create-profile.sh # create login account
```

After startup:

- Visit <https://penpot.local/>
- Account `admin@penpot.local` / `penpot123` (change the password after login at `/auth/profile`)
- MCP: `https://penpot.local/mcp/stream`

> **Note**: a brand-new deployment's database is **empty**, with no accounts at all — you must run
> `create-profile.sh` before logging in. The account/password hinted by `up.sh` only exists "after it is created".

## Windows + Docker (quick diff vs Linux)

The scripts (`scripts/`) provide both `.sh` (Linux/macOS) and `.ps1` (Windows) sets,
identical in function, only swapping Linux-specific steps for Windows equivalents:

| Step | Linux (`.sh`) | Windows (`.ps1`) |
|---|---|---|
| Pull images | `./scripts/prewarm.sh` | `.\scripts\prewarm.ps1` |
| Start + wait ready | `./scripts/up.sh` | `.\scripts\up.ps1` |
| Install CA / trust | `./scripts/trust-ca.sh` | `.\scripts\trust-ca.ps1` |
| Create login account | `./scripts/create-profile.sh` | `.\scripts\create-profile.ps1` |
| Status / logs / stop | `status` / `tail-logs` / `down` | same-named `.ps1` |
| One-click install | — | `.\scripts\install.ps1` (chains the four steps above) |

One-click install (first time):

```powershell
cd <this directory>
.\scripts\install.ps1                 # optional: -Email ... -Password ... -NoPrewarm
```

Key points:

1. **Open PowerShell as administrator** before running the scripts, otherwise writing the `hosts` file is skipped (the script will
   tell you to manually add `127.0.0.1 penpot.local`).
2. **CA trust**: `trust-ca.ps1` installs Caddy's internal CA into the **current user's**
   `Trusted Root Certification Authorities` store (no admin needed), and writes the user-level
   `NODE_EXTRA_CA_CERTS` environment variable so Node.js / Electron MCP clients (CodeBuddy /
   VSCode / Codex) can also validate the self-signed cert. **You must restart the browser and AI client afterward**.
3. **Port forwarding**: in `compose.yaml` caddy publishes `127.0.0.1:443:443`. Docker Desktop
   forwards the container port to the Windows host's `127.0.0.1:443`, so the browser can just visit
   `https://penpot.local/`. If it cannot connect in some environments, change `127.0.0.1:443:443` to
   `443:443` and `up` once more.
4. **`.local` domain**: Windows's `hosts` file usually takes precedence over mDNS, but some browsers resolve
   `*.local` via mDNS. If "server not found" appears, switch the hostname to `penpot.test`:
   set the env var `PENPOT_HOST=penpot.test`, and sync-change `.env`'s `PENPOT_PUBLIC_URI` and
   `caddy/Caddyfile`'s site block (change `penpot.local` to `penpot.test`). The scripts all read
   `PENPOT_HOST`, so no script changes are needed.
5. **Data-directory permissions**: `data/` is bind-mounted into the Linux container (inside Docker Desktop's
   Linux VM). If Postgres/Valkey report a permission error on first init, first `down` then `up`; if still failing,
   add `:z` to relabel the mount in `compose.yaml`, or switch to a named volume.

> Engine-detection logic is in `scripts/lib.ps1`: it detects `docker compose` (v2) or `docker-compose`
> (v1) and picks one. `.ps1` runs on Windows + Docker Desktop.
>
> **Execution policy**: Windows may block running `.ps1` by default ("cannot be loaded because running scripts is disabled").
> Before first run, in an admin PowerShell execute once
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`; or invoke each time with
> `powershell -ExecutionPolicy Bypass -File .\scripts\up.ps1`.
>
> **Docker Desktop users note**: make sure Docker Desktop is started (system-tray icon green/running),
> and the compose plugin is installed (ships by default). Otherwise `docker compose version` fails and the script will prompt
> to start Docker Desktop first.

## Moved directory / re-clone and the browser reports a cert error?

This is **expected behavior**, not a broken script: Caddy's `data/caddy/pki` is independent per deployment directory,
generating a **brand-new CA key pair** on first start. So moving the directory or re-cloning equals switching the CA,
while the browser still trusts the previous one — hence the cert error.

`./scripts/status.sh`'s `==> Certificate` section shows the currently effective CA (including `notBefore`),
and `./scripts/trust-ca.sh`'s closing `Chain check` directly tells you whether the cert issued by the server
matches the just-installed CA — a mismatch means the CA was switched.

Two solutions, pick as needed:

**A. Reuse the existing CA** (recommended; no browser restart, team need not reinstall certs):
copy the old deployment's PKI over, then restart the stack.

```bash
./scripts/down.sh
sudo rm -rf data/caddy/pki data/caddy/certificates
sudo cp -a /path/to/old-deployment/data/caddy/pki data/caddy/pki
./scripts/up.sh
```

**B. Use a new CA, re-issue trust**: `./scripts/trust-ca.sh`, then **restart the browser**.

## Certificate and MCP clients

The leaf cert is issued by Caddy's internal CA; the browser reports "Your connection is not private",
and Node/Electron clients (Codebuddy / Codex / VSCode / Claude Code) also directly report
`fetch failed: unable to get local issuer certificate`. Run once:

```bash
./scripts/trust-ca.sh
```

It writes to four places: the system OpenSSL trust store (curl/openssl), `~/.pki/nssdb`
(Chrome / Edge / Playwright), each Firefox profile's `cert9.db`, and
`NODE_EXTRA_CA_CERTS` (`~/.zshenv`, `~/.bashrc`, `/etc/environment`).
**You must restart the AI client afterward** — env vars do not enter already-running processes.

## Script portability conventions

This is the core of the cleanup; please follow these when changing scripts:

1. **No absolute paths**. All deployment paths are derived by `scripts/lib.sh` from the script's own location
   (`BASH_SOURCE` + stepwise symlink resolution, compatible with macOS lacking `readlink -f`).
   So you can `cd /tmp && bash /path/to/scripts/up.sh`, or symlink the script to
   `~/bin`.
2. The only remaining absolute paths are `/etc/hosts`, `/usr/local/share/ca-certificates`,
   `/etc/environment`, and the trust stores under `$HOME` — these are fixed on every machine.
3. The hostname is controlled by `PENPOT_HOST` (default `penpot.local`); when changing it, sync-change
   `.env`'s `PENPOT_PUBLIC_URI` and `caddy/Caddyfile`'s site block.
4. `compose.yaml` deliberately **omits** `name:`. The project name is derived from the containing directory, so multiple
   checkouts coexisting on the same machine won't preempt each other or even rebuild each other's containers. To fix a name, set
   `COMPOSE_PROJECT_NAME` in `.env`.
5. The image tag uniformly goes through `PENPOT_IMAGE_TAG` (`compose.yaml` and `prewarm.sh` read the same
   variable), so an upgrade changes only one place.

## Stop

```bash
./scripts/down.sh            # stop, keep ./data
./scripts/down.sh --volumes  # stop and delete named volumes (unrecoverable)
```
