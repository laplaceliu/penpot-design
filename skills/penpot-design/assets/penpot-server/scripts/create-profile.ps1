# create-profile.ps1 - create (or verify) a Penpot login account (Win / Docker).
# Mirrors create-profile.sh. A fresh deployment starts with an EMPTY profile
# table, so the credentials printed by up.ps1 do not exist until this runs.
#
# Behaviour:
#   account missing            -> created
#   account exists             -> success, password left UNTOUCHED
#   account exists + -Force    -> password reset to the given one

[CmdletBinding()]
param(
  [string]$Email    = $env:PENPOT_ADMIN_EMAIL,
  [string]$Password = $env:PENPOT_ADMIN_PASSWORD,
  [string]$Fullname = $env:PENPOT_ADMIN_FULLNAME,
  [switch]$Force,
  [switch]$NoVerify,
  [switch]$Help
)

if ($Help) {
  Write-Host @'
Usage: .\create-profile.ps1 [-Email <email>] [-Password <pw>] [-Fullname <name>]
                            [-Force] [-NoVerify] [-Help]

  -Email    login email         (default: admin@penpot.local)
  -Password password            (default: prompt securely; or $env:PENPOT_ADMIN_PASSWORD)
  -Fullname display name        (default: Admin)
  -Force    reset password of an EXISTING account
  -NoVerify skip the login check at the end
  -Help     show this help

Environment alternatives: PENPOT_ADMIN_EMAIL, PENPOT_ADMIN_PASSWORD, PENPOT_ADMIN_FULLNAME
'@
  exit 0
}

. "$PSScriptRoot\lib.ps1"
Detect-Compose
Require-ComposeFile

if ([string]::IsNullOrWhiteSpace($Email))    { $Email    = 'admin@penpot.local' }
if ([string]::IsNullOrWhiteSpace($Fullname)) { $Fullname = 'Admin' }

$BACKEND_SERVICE  = 'penpot-backend'
$POSTGRES_SERVICE = 'penpot-postgres'
$DB_USER = 'penpot'
$DB_NAME = 'penpot'
$MANAGE_PY = '/opt/penpot/backend/manage.py'

# --- backend must be running ------------------------------------------------
$q = Compose-Raw -f $COMPOSE_FILE ps -q $BACKEND_SERVICE 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($q)) {
  Write-Error (@"
ERROR: the '$BACKEND_SERVICE' container is not running.
  Start the stack first:  .\up.ps1
"@)
  exit 1
}

# --- wait for the backend prepl port (6063) --------------------------------
Write-Host '==> Waiting for the backend prepl port to accept connections'
$preplOk = $false
for ($i = 0; $i -lt 15; $i++) {
  Compose-Raw -f $COMPOSE_FILE exec $global:EXEC_TTY $BACKEND_SERVICE `
      bash -c "exec 3<>/dev/tcp/127.0.0.1/6063" 2>$null
  if ($LASTEXITCODE -eq 0) { $preplOk = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $preplOk) {
  Write-Error (@"
ERROR: prepl on $BACKEND_SERVICE:6063 never became ready.
  Check the backend logs:  .\tail-logs.ps1 $BACKEND_SERVICE
"@)
  exit 1
}

# --- read / validate password ----------------------------------------------
if ([string]::IsNullOrWhiteSpace($Password)) {
  if ([Console]::IsInputRedirected) {
    Write-Error (@'
ERROR: no password given and stdin is not a terminal.
  Use -Password <password> or set PENPOT_ADMIN_PASSWORD (e.g. in CI).
'@)
    exit 1
  }
  $secure = Read-Host -Prompt "Password for $Email" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ([string]::IsNullOrWhiteSpace($Password)) {
  Write-Error 'ERROR: password must not be empty.'
  exit 1
}
# These chars would break out of manage.py's double-quoted command line.
if ($Password -match '["$`\\]') {
  Write-Error (@'
ERROR: the password contains one of  " $ ` \  - characters that cannot be passed
  through manage.py safely. Pick a different password.
'@)
  exit 1
}

# --- helpers ----------------------------------------------------------------
# Run manage.py inside the backend container; secrets travel as -e KEY=VALUE
# (mirrors create-profile.sh), never interpolated into the command string.
# Returns the exit code; stdout is captured into $script:LastManageOutput.
$script:LastManageOutput = ''
function Invoke-Manage {
  param([string]$ArgsStr)
  $expr = "cd /opt/penpot/backend && python3 '$MANAGE_PY' $ArgsStr"
  $tmp = Join-Path $env:TEMP ('mg-' + [guid]::NewGuid().ToString() + '.log')
  Compose-Raw -f $COMPOSE_FILE exec $global:EXEC_TTY `
      -e "PP_EMAIL=$Email" -e "PP_PASSWORD=$Password" -e "PP_FULLNAME=$Fullname" `
      $BACKEND_SERVICE bash -c $expr *>$tmp
  $code = $LASTEXITCODE
  $script:LastManageOutput = (Get-Content $tmp -Raw); Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  return $code
}

# active / deleted / missing - via direct Postgres query (psql quotes :'email').
function Get-ProfileState {
  $q1 = "select count(*) from profile where email = :'email' and deleted_at is null;"
  $n1 = ($q1 | Compose-Raw -f $COMPOSE_FILE exec $global:EXEC_TTY `
          $POSTGRES_SERVICE psql -U $DB_USER -d $DB_NAME -v email="$Email" -tA 2>$null) `
        -join '' -replace '\s', ''
  if ($n1 -match '^\d+$' -and [int]$n1 -gt 0) { return 'active' }
  $q2 = "select count(*) from profile where email = :'email';"
  $n2 = ($q2 | Compose-Raw -f $COMPOSE_FILE exec $global:EXEC_TTY `
          $POSTGRES_SERVICE psql -U $DB_USER -d $DB_NAME -v email="$Email" -tA 2>$null) `
        -join '' -replace '\s', ''
  if ($n2 -match '^\d+$' -and [int]$n2 -gt 0) { return 'deleted' }
  return 'missing'
}

$CHANGED = 0
Write-Host ''
$STATE = Get-ProfileState
switch ($STATE) {
  'active' {
    if ($Force) {
      Write-Host "==> Account '$Email' exists - resetting its password (--Force)"
      $null = Invoke-Manage 'update-profile -e "$PP_EMAIL" -p "$PP_PASSWORD"'
      Write-Host '    password updated'
      $CHANGED = 1
    } else {
      Write-Host "==> Account '$Email' already exists - nothing to do."
      Write-Host '    Its password was NOT changed. To reset it, re-run with -Force.'
      Write-Host '    (A fresh database starts out empty; this account came from the'
      Write-Host '     existing ./data volume, which is where all your files live too.)'
    }
  }
  'deleted' {
    Write-Host "==> '$Email' exists but is soft-deleted - recreating it"
    Write-Host "==> Creating account '$Email'"
    $rc = Invoke-Manage 'create-profile -e "$PP_EMAIL" -p "$PP_PASSWORD" -n "$PP_FULLNAME" --skip-tutorial --skip-walkthrough'
    $out = $script:LastManageOutput
    if ($rc -ne 0) { Write-Error "ERROR: failed to create '$Email'.`n$out"; exit 1 }
    Write-Host ($out.Trim() -replace '(?m)^', '    ')
    $CHANGED = 1
  }
  'missing' {
    Write-Host "==> Creating account '$Email'"
    $rc = Invoke-Manage 'create-profile -e "$PP_EMAIL" -p "$PP_PASSWORD" -n "$PP_FULLNAME" --skip-tutorial --skip-walkthrough'
    $out = $script:LastManageOutput
    if ($rc -ne 0) { Write-Error "ERROR: failed to create '$Email'.`n$out"; exit 1 }
    Write-Host ($out.Trim() -replace '(?m)^', '    ')
    $CHANGED = 1
  }
  default {
    Write-Error "ERROR: unexpected profile state '$STATE'."
    exit 1
  }
}

if ($NoVerify) {
  Write-Host ''
  Write-Host 'Done (verification skipped).'
  Write-Host "  URL:      https://$HOST_NAME/"
  Write-Host "  Username: $Email"
  exit 0
}

# --- verify the credentials against the real login endpoint ------------------
Write-Host ''
Write-Host '==> Verifying the credentials against the real login endpoint'

$probeArgs = @('--insecure', '--silent', '--max-time', '15', '--resolve', "${HOST_NAME}:443:127.0.0.1")
if (Test-CaPresent) {
  $probeArgs += @('--cacert', $CA_CERT)
} else {
  Write-Host '    (CA not found - falling back to the host trust store)'
}
# Penpot RPC speaks Transit, not JSON.
$body = '["^ ","~:email","' + $Email + '","~:password","' + $Password + '"]'
$respFile = Join-Path $env:TEMP ('penpot-login-' + [guid]::NewGuid().ToString() + '.out')
# Native stderr (e.g. curl's progress meter) is treated as a terminating error
# on hosts where $ErrorActionPreference = 'Stop'. Downgrade locally so a stray
# stderr line cannot abort the script; we still rely on $LASTEXITCODE.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $code = & curl.exe @probeArgs -o $respFile -w '%{http_code}' `
          -X POST "https://$HOST_NAME/api/rpc/command/login-with-password" `
          -H 'content-type: application/transit+json' --data $body 2>$null
} finally {
  $ErrorActionPreference = $prevEap
}
if ($LASTEXITCODE -ne 0) { $code = 'ERR' }
$resp = ''
if (Test-Path $respFile) { $resp = (Get-Content $respFile -Raw); Remove-Item $respFile -Force }

$verifyOk = $false
if ($code -eq '200' -and ($resp -match '~:auth-backend')) {
  Write-Host '    login OK (HTTP 200)'
  $verifyOk = $true
} elseif ($CHANGED -ne 1) {
  Write-Host '    NOTE: the password you supplied is NOT this account''s current password.'
  Write-Host '          The account was left untouched. To set it, re-run with -Force.'
  Write-Host "          (HTTP $code)"
} else {
  Write-Error (@"
ERROR: login check failed (HTTP $code) even though the account was just created/updated.
  Response: $resp
  Check the backend logs:  .\tail-logs.ps1 $BACKEND_SERVICE
"@)
  exit 1
}

Write-Host ''
if (-not $verifyOk) {
  Write-Host "Account '$Email' exists, but NOT with the password you supplied."
  Write-Host "  Reset it with:  .\create-profile.ps1 -Email '$Email' -Force -Password '<new-password>'"
  exit 0
}

Write-Host 'Penpot login ready.'
Write-Host "  URL:      https://$HOST_NAME/"
Write-Host "  Username: $Email"
Write-Host '  Password: (the one you supplied)'
if ($Email -eq 'admin@penpot.local' -and $Password -eq 'penpot123') {
  Write-Host ''
  Write-Host '  WARNING: this is the well-known default password - change it under'
  Write-Host '  /auth/profile once you are logged in.'
}
