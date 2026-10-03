# lib.ps1 - shared helpers for the Windows Penpot deployment scripts.
# This is the Windows port of lib.sh. Every *.ps1 in this folder sources it:
#     . "$PSScriptRoot\lib.ps1"
#
# Why: all deployment paths are derived from this file's own location, so the
# checkout can be copied anywhere (C:\penpot, a project dir, a CI workspace)
# and the scripts still find compose.yaml, caddy/Caddyfile and data/.
#
# Engine: Docker Desktop (`docker compose` / `docker-compose`). The scripts run
# on Windows + Docker Desktop (primary target) and any Docker host.

$ErrorActionPreference = 'Stop'

$SCRIPT_DIR = $PSScriptRoot
# Server root = parent of scripts/
$SERVER_DIR = (Resolve-Path (Join-Path $SCRIPT_DIR '..')).Path

$COMPOSE_FILE = Join-Path $SERVER_DIR 'compose.yaml'
$CADDYFILE    = Join-Path $SERVER_DIR 'caddy\Caddyfile'
$DATA_DIR     = Join-Path $SERVER_DIR 'data'
# Caddy writes its internal CA here on first boot.
$CA_CERT      = Join-Path $DATA_DIR 'caddy\pki\authorities\local\root.crt'

# Hostname Caddy signs the leaf cert for. Override with $env:PENPOT_HOST.
$HOST_NAME = if ($env:PENPOT_HOST) { $env:PENPOT_HOST } else { 'penpot.local' }

# Set by Detect-Compose. COMPOSE_CMD is an array: [docker-binary, 'compose']
# (or just [docker-compose] for v1). Invoke it via Compose / Compose-Raw, which
# splat the array properly - note that PowerShell's `& $array` does NOT splat a
# command array the way bash "${arr[@]}" does, so never call it directly.
$global:COMPOSE_CMD = $null
$global:COMPOSE_ENGINE = $null   # 'docker'
$global:EXEC_TTY = @('-T')        # docker needs -T (no TTY in scripts)
$global:DOCKER_BIN = $null       # resolved real docker executable (skips PATH shims)

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = [Security.Principal.WindowsPrincipal]::new($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Probe an engine's `compose version`, swallowing any native failure (missing
# binary, broken Windows Store alias stub, or Docker Desktop not running).
# Returns $true only when the probe both ran and exited 0.
function Test-ComposeVersion {
  param([string[]]$Command)
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    $prog = $Command[0]
    $argsArr = @($Command[1..($Command.Length - 1)]) + 'version'
    & $prog @argsArr 2>$null | Out-Null
  } catch {
    return $false
  }
  return ($LASTEXITCODE -eq 0)
}

function Detect-Compose {
  if ($global:COMPOSE_CMD) { return }

  # The machine may have a `docker` on PATH that is NOT the real Docker Desktop
  # binary - e.g. a Podman compatibility shim (common on Windows dev setups).
  # Such a shim shadows Docker Desktop and makes `docker compose` fail. So we
  # probe Docker Desktop's own install location directly, and let $env:DOCKER_BIN
  # override the search entirely.
  $candidates = [System.Collections.Generic.List[string]]::new()
  $dockerSeen = $false

  if ($env:DOCKER_BIN -and (Test-Path $env:DOCKER_BIN)) {
    $candidates.Add($env:DOCKER_BIN)
  }

  $pathDocker = (Get-Command docker -ErrorAction SilentlyContinue).Source
  if ($pathDocker) {
    $dockerSeen = $true
    # Skip obvious shims: a *.cmd wrapper, or anything living in a "shim" dir.
    if (($pathDocker -notlike '*.cmd') -and ($pathDocker -notmatch 'shim')) {
      $candidates.Add($pathDocker)
    }
  }

  $ddDirs = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\DockerDesktop\resources\bin\docker.exe",
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    'C:\Program Files\Docker\Docker\resources\bin\docker.exe',
    "$env:ProgramFiles\Docker\resources\bin\docker.exe",
    'C:\Program Files\Docker\resources\bin\docker.exe'
  )
  foreach ($c in $ddDirs) {
    if ($c -and (Test-Path $c)) { $candidates.Add($c); $dockerSeen = $true }
  }

  # De-duplicate while preserving order.
  $seen = @{}
  $unique = foreach ($c in $candidates) {
    if (-not $seen.ContainsKey($c)) { $seen[$c] = $true; $c }
  }

  # Run the version probe without letting a failing native command throw and
  # abort the whole script: downgrade the preference locally and rely on
  # $LASTEXITCODE. (If Docker Desktop is not running, `docker compose version`
  # fails with a socket error - that is not a "missing compose" condition.)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    foreach ($bin in $unique) {
      if (Test-ComposeVersion @($bin, 'compose')) {
        $global:COMPOSE_CMD = @($bin, 'compose')
        $global:COMPOSE_ENGINE = 'docker'
        $global:EXEC_TTY = @('-T')
        $global:DOCKER_BIN = $bin
        return
      }
    }
    # Standalone `docker-compose` (v1) as a last resort.
    $dc = (Get-Command docker-compose -ErrorAction SilentlyContinue).Source
    if ($dc -and (Test-ComposeVersion @($dc))) {
      $global:COMPOSE_CMD = @($dc)
      $global:COMPOSE_ENGINE = 'docker'
      $global:EXEC_TTY = @('-T')
      $global:DOCKER_BIN = $pathDocker  # used only for `docker info`; may be a shim
      return
    }
  } finally {
    $ErrorActionPreference = $prev
  }

  # No engine reported a working `compose version`. Give a helpful reason rather
  # than a raw stack trace.
  if ($dockerSeen) {
    Write-Host "ERROR: 'docker' is installed but `docker compose` could not run." -ForegroundColor Red
    Write-Host '  Start Docker Desktop (or install the compose plugin), then retry.' -ForegroundColor Yellow
    Write-Host '  If `docker` on PATH is a 3rd-party shim, set $env:DOCKER_BIN to the' -ForegroundColor Yellow
    Write-Host '  real Docker Desktop docker.exe (e.g.' -ForegroundColor Yellow
    Write-Host "    $env:LOCALAPPDATA\DockerDesktop\resources\bin\docker.exe)." -ForegroundColor Yellow
  } else {
    Write-Host 'ERROR: no docker compose found.' -ForegroundColor Red
    Write-Host '  Install Docker Desktop (https://www.docker.com/products/docker-desktop)' -ForegroundColor Yellow
    Write-Host '  with the compose plugin (installed by default), start it, and re-open' -ForegroundColor Yellow
    Write-Host '  this terminal to retry.' -ForegroundColor Yellow
  }
  exit 1
}

# Run `docker compose` (or `docker-compose`) with the given arguments and return.
# Does NOT add -f; callers pass it. Does NOT exit on failure, so callers can
# inspect $LASTEXITCODE / capture output / pipe data to stdin. Piped input (e.g. a
# SQL query) is forwarded to the compose command's stdin.
function Compose-Raw {
  begin {
    Detect-Compose
    $prog = $global:COMPOSE_CMD[0]
    $sub  = if ($global:COMPOSE_CMD.Length -gt 1) { @($global:COMPOSE_CMD[1..($global:COMPOSE_CMD.Length - 1)]) } else { @() }
    $pipeData = [System.Collections.Generic.List[object]]::new()
  }
  process {
    if ($_ -ne $null) { $pipeData.Add($_) | Out-Null }
  }
  end {
    $allArgs = @($sub) + $args
    # Some docker compose subcommands (notably `up -d`) write routine progress to
    # stderr. If the host PowerShell treats native stderr as a terminating error
    # ($ErrorActionPreference = 'Stop'), that would abort the script even on
    # success. Downgrade locally so stderr is shown but non-fatal; we still rely
    # on $LASTEXITCODE for real failures.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      if ($pipeData.Count -gt 0) {
        $pipeData | & $prog @allArgs
      } else {
        & $prog @allArgs
      }
    } finally {
      $ErrorActionPreference = $prevEap
    }
  }
}

# Run compose for an action that must succeed. Adds -f $COMPOSE_FILE, then exits
# 1 on any failure so callers (install.ps1, up.ps1, down.ps1) can rely on
# $LASTEXITCODE. Stdout is passed through; stderr is collected and only printed
# (in red) when the command actually fails, so routine progress (e.g. `up -d`
# writes to stderr) never shows as a scary error on success.
function Compose {
  Detect-Compose
  $prog = $global:COMPOSE_CMD[0]
  $sub  = if ($global:COMPOSE_CMD.Length -gt 1) { @($global:COMPOSE_CMD[1..($global:COMPOSE_CMD.Length - 1)]) } else { @() }
  $allArgs = @($sub) + '-f' + $COMPOSE_FILE + $args
  $errBuf = New-Object System.Text.StringBuilder
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $prog @allArgs 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        [void]$errBuf.AppendLine($_.ToString())
      } else {
        $_
      }
    }
  } finally {
    $ErrorActionPreference = $prevEap
  }
  if ($LASTEXITCODE -ne 0) {
    if ($errBuf.Length -gt 0) { Write-Host $errBuf.ToString().Trim() -ForegroundColor Red }
    Write-Host "ERROR: compose failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
  }
}

# Warn early (non-fatally) when the Docker daemon is not reachable, so `compose`
# does not fail later with an obscure error. (On Windows, Docker Desktop runs the
# Linux-containers VM; the daemon must be up for `docker compose` to work.)
function Assert-EngineReady {
  if ($global:COMPOSE_ENGINE -ne 'docker') { return }
  # Prefer the resolved real docker binary so a PATH shim does not fool the probe.
  $bin = if ($global:DOCKER_BIN) { $global:DOCKER_BIN } else { 'docker' }
  $ok = $false
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    & $bin info >$null 2>&1
    $ok = ($LASTEXITCODE -eq 0)
  } catch { $ok = $false }
  if (-not $ok) {
    Write-Warning (@"
Docker daemon not reachable. Start Docker Desktop first, then retry.
(On Windows, Docker Desktop runs the Linux-containers VM; the daemon must be up
for `docker compose` to work.)
"@)
  }
}

function Require-ComposeFile {
  if (-not (Test-Path $COMPOSE_FILE)) {
    Write-Error "ERROR: $COMPOSE_FILE not found. The scripts must live in <deployment>/scripts/."
    exit 1
  }
}

function Test-HostEntry {
  param([string]$HostName)
  $hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
  if (-not (Test-Path $hosts)) { return $false }
  foreach ($line in (Get-Content $hosts)) {
    if ($line -match "^\s*127\.0\.0\.1\s+$HostName\s*$") { return $true }
  }
  return $false
}

# Run a PowerShell snippet in an elevated (UAC) child process. Returns $true only
# if the elevated command exited 0. Mirrors `sudo` for a single privileged op
# (writing the hosts file, importing a cert, setting Machine env).
function Invoke-Elevated {
  param([string]$Script)
  try {
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($Script)
    $enc   = [Convert]::ToBase64String($bytes)
    $p = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden `
          -ArgumentList '-NoProfile', '-EncodedCommand', $enc -PassThru -Wait
    return ($null -ne $p -and $p.ExitCode -eq 0)
  } catch {
    return $false
  }
}

# Ensure 127.0.0.1 <host> is in the Windows hosts file.
# - Already elevated: write directly.
# - Not elevated: mirror Linux `sudo tee -a /etc/hosts` by spawning an *elevated
#   child* that writes ONLY this one line (pops a UAC prompt, like sudo). On
#   denial / no elevation we fall back to the manual hint instead of aborting.
function Add-HostEntry {
  param([string]$HostName = 'penpot.local', [string]$Ip = '127.0.0.1')
  if (Test-HostEntry $HostName) { return $true }
  $hosts = "$env:SystemRoot\System32\drivers\etc\hosts"

  if (Test-Admin) {
    Add-Content -Path $hosts -Value ([Environment]::NewLine + "$Ip $HostName") -Encoding ASCII
    Write-Host "==> Added '$Ip $HostName' to the hosts file"
    return $true
  }

  # Not elevated: the entry is written by an elevated child (one line only).
  $entry  = "$Ip $HostName"
  $script = "Add-Content -Path '$hosts' -Value ([Environment]::NewLine + '$entry') -Encoding ASCII"
  if (Invoke-Elevated $script -and (Test-HostEntry $HostName)) {
    Write-Host "==> Added '$entry' to the hosts file (elevated)"
    return $true
  }

  Write-Warning (@"
'$HostName' is missing from the hosts file and could not be added automatically.
Add it manually as Administrator, then re-run:
    $Ip $HostName   ->   $hosts
(Tip: right-click your terminal and 'Run as Administrator', or approve the UAC prompt.)
"@)
  return $false
}

# Mirror the ./data/... bind mounts in compose.yaml so containers (postgres uid
# 999, valkey) can initialise without permission errors on first boot.
function New-DataDirs {
  foreach ($rel in @('postgres/data', 'valkey/data', 'exports', 'caddy')) {
    $target = Join-Path $DATA_DIR $rel
    if (-not (Test-Path $target)) {
      New-Item -ItemType Directory -Force -Path $target | Out-Null
    }
  }
}

function Test-CaPresent { return (Test-Path $CA_CERT) }

# HTTPS probe pinned to loopback (matches the hosts entry). Returns the HTTP
# status code string, or 'ERR' if curl.exe is missing / unreachable.
function Invoke-Probe {
  param([string]$Path = '/')
  # Guard: if curl.exe is absent (or aliased away), return ERR instead of throwing
  # and aborting the caller's wait loop.
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { return 'ERR' }
  $url = "https://${HOST_NAME}${Path}"
  $resolve = "${HOST_NAME}:443:127.0.0.1"
  # NOTE: use `nul` (not PowerShell's $null) as the output target. When $null is
  # passed to an external command it becomes an empty string, so curl would print
  # the response body to stdout and $code would never equal '200'.
  $code = & curl.exe --silent --output nul --write-out '%{http_code}' `
            --insecure --max-time 5 --resolve $resolve $url 2>$null
  if ($LASTEXITCODE -ne 0) { return 'ERR' }
  return $code.Trim()
}
